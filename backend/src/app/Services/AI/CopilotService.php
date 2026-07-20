<?php

declare(strict_types=1);

namespace App\Services\AI;

use App\Enums\TaskType;
use App\Models\User;
use App\Services\AI\Crm\CrmLeadReadArgsResolver;
use App\Services\AI\Crm\EmailInferenceService;
use App\Services\AI\Crm\LeadInferenceService;
use App\Services\AI\Crm\VisitLogInferenceService;
use App\Services\AI\Kpi\KpiInferenceService;
use App\Services\AI\Context\ConversationMemoryService;
use App\Services\AI\Policy\ActionConfirmationPolicyService;
use App\Services\AI\Policy\ToolPolicyService;
use App\Services\AI\Providers\AiGenerationResult;
use App\Services\AI\Providers\AiProviderRouter;
use App\Services\AI\Tools\ActionToolRegistry;
use App\Services\AI\Tools\ReadToolRegistry;
use App\Services\Company\CompanyContextService;
use App\Enums\NotificationCategory;
use App\Services\Demo\DemoCompanyService;
use App\Services\Notification\NotificationService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use App\Services\AI\AiLoggingService;
use App\Services\AI\Support\LocalDateTimeContext;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

class CopilotService
{
    public function __construct(
        private readonly AiLoggingService $aiLoggingService,
        private readonly CompanyContextService $companyContextService,
        private readonly ToolPolicyService $toolPolicyService,
        private readonly ActionConfirmationPolicyService $actionConfirmationPolicyService,
        private readonly ReadToolRegistry $readToolRegistry,
        private readonly ActionToolRegistry $actionToolRegistry,
        private readonly ConversationMemoryService $conversationMemoryService,
        private readonly AiProviderRouter $aiProviderRouter,
        private readonly MeetingInferenceService $meetingInferenceService,
        private readonly LeadInferenceService $leadInferenceService,
        private readonly EmailInferenceService $emailInferenceService,
        private readonly KpiInferenceService $kpiInferenceService,
        private readonly NotificationInferenceService $notificationInferenceService,
        private readonly InternalUserInferenceService $internalUserInferenceService,
        private readonly TaskInferenceService $taskInferenceService,
        private readonly TaskReassignInferenceService $taskReassignInferenceService,
        private readonly VisitLogInferenceService $visitLogInferenceService,
        private readonly ActionDraftStore $actionDraftStore,
        private readonly NotificationService $notificationService,
        private readonly DemoCompanyService $demoCompanyService,
        private readonly ReadToolSynthesisService $readToolSynthesisService,
        private readonly CrmLeadReadArgsResolver $crmLeadReadArgsResolver,
        private readonly ReadToolArgsResolver $readToolArgsResolver,
        private readonly LocalDateTimeContext $localDateTimeContext,
        private readonly CopilotIntentResolver $intentResolver,
    ) {}

    public function chat(
        User $user,
        string $message,
        ?int $companyId = null,
        ?string $threadId = null,
        array $actionArgs = [],
        bool $actionConfirmed = false,
        ?string $idempotencyKey = null,
        ?string $clientTimezone = null,
        array $chatContext = [],
    ): array {
        $companyContext = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $companyContext['company']->id;
        $role = (string) $companyContext['role'];
        $companyCountry = (string) ($companyContext['company']->country ?? '');

        if (! $this->canConsumeCredits($resolvedCompanyId)) {
            $this->aiLoggingService->cancelled(
                companyId: $resolvedCompanyId,
                userId: (int) $user->id,
                sessionId: $threadId,
                reason: 'Monthly credit limit exceeded.',
            );
            return $this->persistAndRespond(
                user: $user,
                companyId: $resolvedCompanyId,
                role: $role,
                message: $message,
                threadId: $threadId,
                intent: ['type' => 'policy', 'tool' => null, 'confidence' => 1.0],
                assistantText: 'AI usage is temporarily paused for this organization because the monthly credit limit has been reached.',
                tool: null,
                sources: ['policy.credit_limit'],
                payload: [
                    'limit_exceeded' => true,
                    'monthly_org_credit_limit' => (int) config('services.ai.monthly_org_credit_limit', 0),
                ],
                creditsConsumed: 0,
            );
        }

        $resolution = $this->intentResolver->resolve(
            message: $message,
            role: $role,
            threadId: $threadId,
            companyId: $resolvedCompanyId,
            userId: (int) $user->id,
            actionArgs: $actionArgs,
            actionConfirmed: $actionConfirmed,
        );

        $intent = $resolution['intent'];
        $actionConfirmed = $resolution['action_confirmed'];
        $actionArgs = $resolution['action_args'];
        $actionMessage = $resolution['action_message'];
        $resolvedActionTool = $resolution['resolved_action_tool'];
        $resolvedReadTool = $resolution['resolved_read_tool'];

        $intentType = (string) ($intent['type'] ?? 'general');

        $assistantText = $this->degradedModeMessage();
        $toolResult = null;
        $resolvedTool = null;

        if (($intentType === 'tool' || $intentType === 'action') && is_string($intent['tool'] ?? null)) {
            $candidateTool = (string) $intent['tool'];
            $routing = $this->aiProviderRouter->routingMetadata('operational');

            if ($intentType === 'action' && ! (bool) config('services.ai.enable_actions', true)) {
                $assistantText = 'ELY write actions are currently disabled by configuration. Read-only answers are still available.';
                $resolvedTool = $candidateTool;
                $toolResult = [
                    'summary' => $assistantText,
                    'sources' => [$candidateTool],
                    'payload' => [
                        'actions_disabled' => true,
                        'tool' => $candidateTool,
                    ],
                ];
            } elseif ($this->toolPolicyService->canUseTool($role, $candidateTool)) {
                if ($intentType === 'action') {
                    if ($this->actionConfirmationPolicyService->requiresConfirmation($candidateTool) && ! $actionConfirmed) {
                        $inferredArgs = $this->inferActionArgs(
                            $actionMessage,
                            $candidateTool,
                            $resolvedCompanyId,
                            $actionArgs,
                            $threadId,
                            (int) $user->id,
                            $role,
                            $clientTimezone,
                            $companyCountry,
                            $message,
                        );
                        $validationWarningCodes = $this->inferActionWarningCodes($candidateTool, $inferredArgs, $role);
                        $validationWarnings = $this->inferActionWarnings($candidateTool, $inferredArgs, $role);
                        $blockingWarningCodes = $this->determineBlockingWarningCodes($validationWarningCodes);
                        $blockingConfirmation = $blockingWarningCodes !== [];
                        $sanitizedArgs = $this->sanitizeActionArgs($inferredArgs);

                        if (is_string($threadId) && $threadId !== '') {
                            $draftId = is_string($actionArgs['draft_id'] ?? null) ? (string) $actionArgs['draft_id'] : null;
                            $draft = $this->actionDraftStore->put(
                                companyId: $resolvedCompanyId,
                                userId: (int) $user->id,
                                threadId: $threadId,
                                tool: $candidateTool,
                                actionArgs: $sanitizedArgs,
                                warningCodes: $validationWarningCodes,
                                blockingWarningCodes: $blockingWarningCodes,
                                draftId: $draftId,
                            );
                            $sanitizedArgs['draft_id'] = $draft['draft_id'];
                            $sanitizedArgs['draft_version'] = $draft['draft_version'];
                        }

                        $toolResult = [
                            'summary' => $this->buildActionPreviewSummary($candidateTool, $inferredArgs, $validationWarnings, $blockingConfirmation),
                            'sources' => [$candidateTool],
                            'payload' => [
                                'confirmation_required' => true,
                                'tool' => $candidateTool,
                                'action_args' => $sanitizedArgs,
                                'validation_warnings' => $validationWarnings,
                                'validation_warning_codes' => $validationWarningCodes,
                                'blocking_warning_codes' => $blockingWarningCodes,
                                'blocking_confirmation' => $blockingConfirmation,
                                'execution_model' => $routing['model'],
                            ],
                        ];
                    } else {
                        $inferredForExecution = $this->inferActionArgs(
                            $actionMessage,
                            $candidateTool,
                            $resolvedCompanyId,
                            $actionArgs,
                            $threadId,
                            (int) $user->id,
                            $role,
                            $clientTimezone,
                            $companyCountry,
                            $message,
                        );
                        $resolvedActionArgs = $this->sanitizeActionArgs($inferredForExecution);

                        // Server-side blocker revalidation — frontend disabled buttons are UX only.
                        $revalidationCodes = $this->inferActionWarningCodes($candidateTool, $inferredForExecution, $role);
                        $revalidationBlocking = $this->determineBlockingWarningCodes($revalidationCodes);
                        if ($actionConfirmed && $actionArgs !== []) {
                            $revalidationBlocking = $this->filterConfirmedExecutionBlockers(
                                $candidateTool,
                                $revalidationBlocking,
                                $actionArgs,
                            );
                        }
                        if ($actionConfirmed && $revalidationBlocking !== []) {
                            $revalidationWarnings = $this->inferActionWarnings($candidateTool, $inferredForExecution, $role);
                            if (is_string($threadId) && $threadId !== '') {
                                $draftId = is_string($resolvedActionArgs['draft_id'] ?? null)
                                    ? (string) $resolvedActionArgs['draft_id']
                                    : null;
                                $draft = $this->actionDraftStore->put(
                                    companyId: $resolvedCompanyId,
                                    userId: (int) $user->id,
                                    threadId: $threadId,
                                    tool: $candidateTool,
                                    actionArgs: $resolvedActionArgs,
                                    warningCodes: $revalidationCodes,
                                    blockingWarningCodes: $revalidationBlocking,
                                    draftId: $draftId,
                                );
                                $resolvedActionArgs['draft_id'] = $draft['draft_id'];
                                $resolvedActionArgs['draft_version'] = $draft['draft_version'];
                            }

                            $toolResult = [
                                'summary' => $this->buildActionPreviewSummary($candidateTool, $resolvedActionArgs, $revalidationWarnings, true),
                                'sources' => [$candidateTool],
                                'payload' => [
                                    'confirmation_required' => true,
                                    'tool' => $candidateTool,
                                    'action_args' => $resolvedActionArgs,
                                    'validation_warnings' => $revalidationWarnings,
                                    'validation_warning_codes' => $revalidationCodes,
                                    'blocking_warning_codes' => $revalidationBlocking,
                                    'blocking_confirmation' => true,
                                    'execution_model' => $routing['model'],
                                ],
                            ];
                        } else {
                            try {
                                $toolResult = $this->executeActionWithIdempotency(
                                    user: $user,
                                    companyId: $resolvedCompanyId,
                                    tool: $candidateTool,
                                    actionArgs: $resolvedActionArgs,
                                    idempotencyKey: $idempotencyKey,
                                );
                                if (is_string($threadId) && $threadId !== '') {
                                    $this->actionDraftStore->markConsumed(
                                        $resolvedCompanyId,
                                        (int) $user->id,
                                        $threadId,
                                        is_string($resolvedActionArgs['draft_id'] ?? null)
                                            ? (string) $resolvedActionArgs['draft_id']
                                            : null,
                                    );
                                }
                            } catch (ValidationException $e) {
                                // Bubble validation issues so HTTP API returns 422 and
                                // clients can render field-level validation errors.
                                throw $e;
                            } catch (Throwable $e) {
                                $assistantText = $this->mapActionFailureMessage($e, $candidateTool);
                                $toolResult = [
                                    'summary' => $assistantText,
                                    'sources' => [$candidateTool],
                                    'payload' => [
                                        'error' => true,
                                        'tool' => $candidateTool,
                                        'action_args' => $this->redactValue($resolvedActionArgs),
                                    ],
                                ];
                            }
                        }
                    }
                } else {
                    $toolResult = $this->readToolRegistry->execute(
                        $candidateTool,
                        $user,
                        $resolvedCompanyId,
                        array_merge(
                            $this->buildReadToolArgs($candidateTool, $chatContext),
                            $this->buildReadToolMessageArgs(
                                $candidateTool,
                                $message,
                                $role,
                                $threadId,
                                $resolvedCompanyId,
                                (int) $user->id,
                            ),
                        ),
                    );
                }

                $assistantText = (string) ($toolResult['summary'] ?? $assistantText);
                if ($intentType === 'tool' && is_array($toolResult)) {
                    $synthesized = $this->readToolSynthesisService->synthesize(
                        tool: $candidateTool,
                        toolResult: $toolResult,
                        userMessage: $message,
                        role: $role,
                        companyName: (string) ($companyContext['company']->name ?? 'your active organization'),
                        companyId: $resolvedCompanyId,
                        userId: (int) $user->id,
                    );
                    if (is_string($synthesized) && trim($synthesized) !== '') {
                        $assistantText = $synthesized;
                    }
                }

                $resolvedTool = $candidateTool;

                if ($resolvedTool === 'planning.daily') {
                    $this->notifyDailyPlanReady($user, $resolvedCompanyId, is_array($toolResult['payload'] ?? null) ? $toolResult['payload'] : []);
                }
            } else {
                $assistantText = 'You are not permitted to access that information with your current role and scope.';
                $resolvedTool = $candidateTool;
                $toolResult = [
                    'summary' => $assistantText,
                    'sources' => [$candidateTool],
                    'payload' => [
                        'denied' => true,
                        'tool' => $candidateTool,
                    ],
                ];
            }
        } else {
            $generalResponse = $this->resolveGeneralResponse(
                user: $user,
                role: $role,
                companyId: $resolvedCompanyId,
                companyName: (string) ($companyContext['company']->name ?? 'your active organization'),
                userId: (int) $user->id,
                threadId: $threadId,
                message: $message,
                clientTimezone: $clientTimezone,
                companyCountry: $companyCountry,
            );
            $assistantText = $generalResponse['text'];
        }

        if ((bool) config('services.ai.pii_redaction_enabled', true)) {
            $assistantText = $this->redactSensitiveText($assistantText);
            if (is_array($toolResult)) {
                if ($resolvedTool !== 'planning.daily') {
                    $payload = $toolResult['payload'] ?? null;
                    if (is_array($payload) && ($payload['confirmation_required'] ?? false) === true) {
                        $actionArgs = is_array($payload['action_args'] ?? null) ? $payload['action_args'] : null;
                        $redactedPayload = $this->redactValue($payload);
                        if (is_array($redactedPayload) && is_array($actionArgs)) {
                            $redactedPayload['action_args'] = $actionArgs;
                        }
                        $toolResult['payload'] = $redactedPayload;
                    } else {
                        $toolResult['payload'] = $this->redactValue($payload);
                    }
                }
                $toolResult['summary'] = $this->redactSensitiveText((string) ($toolResult['summary'] ?? ''));
            }
        }

        return $this->persistAndRespond(
            user: $user,
            companyId: $resolvedCompanyId,
            role: $role,
            message: $message,
            threadId: $threadId,
            intent: $intent,
            assistantText: $assistantText,
            tool: $resolvedTool,
            sources: $toolResult['sources'] ?? [],
            payload: $toolResult['payload'] ?? null,
            creditsConsumed: $this->demoCompanyService->isDemo($resolvedCompanyId) ? 0 : 1,
        );
    }

    private function persistAndRespond(
        User $user,
        int $companyId,
        string $role,
        string $message,
        ?string $threadId,
        array $intent,
        string $assistantText,
        ?string $tool,
        array $sources,
        mixed $payload,
        int $creditsConsumed,
    ): array {
        $userMessage = (bool) config('services.ai.pii_redaction_enabled', true)
            ? $this->redactSensitiveText($message)
            : $message;

        $thread = $this->conversationMemoryService->appendMessage(
            companyId: $companyId,
            userId: (int) $user->id,
            threadId: $threadId,
            role: 'user',
            content: $userMessage,
            payload: [
                'intent' => $intent,
            ],
        );

        $resolvedThreadId = (string) $thread['thread_id'];

        $this->conversationMemoryService->appendMessage(
            companyId: $companyId,
            userId: (int) $user->id,
            threadId: $resolvedThreadId,
            role: 'assistant',
            content: $assistantText,
            sources: $sources,
            tool: $tool,
            payload: $payload,
        );

        if ($creditsConsumed > 0) {
            $this->registerCreditUsage($companyId, $creditsConsumed);
        }

        return [
            'thread_id' => $resolvedThreadId,
            'role' => $role,
            'company_id' => $companyId,
            'intent' => $intent,
            'response' => [
                'content' => $assistantText,
                'tool' => $tool,
                'sources' => $sources,
                'payload' => $payload,
            ],
        ];
    }

    public function hasThread(User $user, string $threadId, ?int $companyId = null): bool
    {
        $context = $this->companyContextService->resolve($user, $companyId);

        return $this->conversationMemoryService->hasThread((int) $context['company']->id, (int) $user->id, $threadId);
    }

    public function getThreadPage(User $user, string $threadId, ?int $companyId = null, int $limit = 20, ?string $cursor = null): ?array
    {
        $context = $this->companyContextService->resolve($user, $companyId);

        return $this->conversationMemoryService->getThreadMessages(
            (int) $context['company']->id,
            (int) $user->id,
            $threadId,
            $limit,
            $cursor,
        );
    }

    /**
     * @return array{text: string, result: ?AiGenerationResult}
     */
    private function resolveGeneralResponse(
        User $user,
        string $role,
        int $companyId,
        string $companyName,
        int $userId,
        ?string $threadId,
        string $message,
        ?string $clientTimezone = null,
        ?string $companyCountry = null,
    ): array {
        $normalized = strtolower(trim($message));
        $resolvedCompanyName = trim($companyName) !== '' ? $companyName : 'your active organization';
        $resolvedTimezone = $this->localDateTimeContext->resolveTimezone($clientTimezone, $companyCountry);
        $promptContext = $this->conversationMemoryService->buildPromptContext($companyId, $userId, $threadId);
        $contextEntities = is_array($promptContext['entities'] ?? null) ? $promptContext['entities'] : [];

        if ($this->intentResolver->looksLikeActionRequest($message) && $this->intentResolver->resolveActionToolFromMessage($message, $threadId, $companyId, $userId) === null) {
            if (preg_match('/\b(lead|crm|business)\b/i', $message) === 1) {
                return ['text' => 'I can add that lead to your CRM. Share the business name, phone number, and location (for example: Business Name: Acme Ltd, Phone: 080..., Location: Lagos), then I will prepare a confirmation form for you.', 'result' => null];
            }

            if (preg_match('/\bkpi\b/i', $message) === 1) {
                return ['text' => 'I can create that KPI. Share the KPI name, objective, target value, expected outcome, dates, and assignee (for example: KPI name: Retail Visits, Objective: Increase field visits, Target value: 50 visits, Expected outcome: Reach 50 qualified visits this month, Assign to: John Wick), then I will prepare a confirmation form for you.', 'result' => null];
            }

            return ['text' => 'This looks like a write action request, but I could not confidently map it to a supported tool. Try phrasing it like "Create a meeting with [name] tomorrow at 2 PM" so I can prepare the confirmation form for you.', 'result' => null];
        }

        if ((str_contains($normalized, 'same agent') || str_contains($normalized, 'that agent')) && is_string($contextEntities['agent'] ?? null)) {
            $message .= ' (same agent refers to: ' . $contextEntities['agent'] . ')';
        }

        // Only answer when the user explicitly asks about their name.
        // Avoid matching generic occurrences like 'my name is ...' inside pasted transcripts.
        if (
            str_contains($normalized, "what's my name")
            || str_contains($normalized, 'what is my name')
            || str_contains($normalized, 'who am i')
        ) {
            return ['text' => "Your name is {$user->name}.", 'result' => null];
        }

        if (
            str_contains($normalized, 'my account')
            || str_contains($normalized, 'my role')
            || str_contains($normalized, 'about my account')
        ) {
            return [
                'text' => sprintf(
                    'You are signed in as %s in %s. I can help you with CRM, tasks, projects, meetings, attendance, tracking, and dashboard operations.',
                    $role,
                    $resolvedCompanyName,
                ),
                'result' => null,
            ];
        }

        if ($this->localDateTimeContext->looksLikeDateTimeQuestion($message)) {
            return [
                'text' => $this->localDateTimeContext->answer($resolvedTimezone, $resolvedCompanyName),
                'result' => null,
            ];
        }

        if ($this->looksLikeProductQuestion($normalized)) {
            return ['text' => ElySystemPrompt::productOverview(), 'result' => null];
        }

        $systemPrompt = ElySystemPrompt::core()
            . "\n\n" . ElySystemPrompt::productKnowledge()
            . "\n\n" . ElySystemPrompt::fewShotExamples();
        $userPrompt = sprintf(
            "Company name: %s\nTenant scope ID (internal, do not mention): %d\nUser name: %s\nRole: %s\n%s\nConversation summary:\n%s\nRecent conversation:\n%s\nKnown entities: %s\nQuestion: %s",
            $this->redactSensitiveText($resolvedCompanyName),
            $companyId,
            $this->redactSensitiveText($user->name),
            $role,
            $this->localDateTimeContext->promptLine($resolvedTimezone),
            (string) ($promptContext['summary'] ?? ''),
            $this->formatRecentMessagesForPrompt($promptContext['recent_messages'] ?? []),
            json_encode($contextEntities),
            $this->redactSensitiveText($message),
        );

        $generationResult = $this->aiProviderRouter->generateForPurpose(
            purpose: 'operational',
            systemPrompt: $systemPrompt,
            userPrompt: $userPrompt,
            options: [
                'company_id' => $companyId,
                'max_tokens' => max(64, (int) config('services.ai.max_tokens', 4000)),
                'temperature' => 0.2,
                '_log' => [
                    'company_id' => $companyId,
                    'user_id' => $userId,
                    'session_id' => $threadId,
                    'intent_type' => 'general',
                    'routing_purpose' => 'operational',
                    'user_prompt' => $message,
                    'sanitized_prompt' => $this->redactSensitiveText($message),
                ],
            ],
        );

        if ($generationResult instanceof AiGenerationResult && $generationResult->isSuccessful()) {
            $trimmed = trim((string) $generationResult->text);
            if ($this->responseClaimsExecutedAction($trimmed)) {
                return [
                    'text' => 'I have not executed that action yet. ELY only confirms task, meeting, KPI, lead, or project creation after the platform action engine succeeds. Please use the Confirm Action button when the confirmation form appears, or provide the required details so I can prepare the action for confirmation.',
                    'result' => $generationResult,
                ];
            }

            return ['text' => $trimmed, 'result' => $generationResult];
        }

        return [
            'text' => $this->degradedModeMessage(
                $generationResult instanceof AiGenerationResult ? $generationResult : null
            ),
            'result' => null,
        ];
    }

    private function looksLikeProductQuestion(string $normalizedMessage): bool
    {
        $normalized = trim($normalizedMessage);
        if ($normalized === '') {
            return false;
        }

        if (preg_match('/\bfactory\s*23\b/i', $normalized) === 1
            && preg_match('/\b(what|which|tell|about|explain|describe|features?|do|does|used?|use|purpose|capabilit)/i', $normalized) === 1
        ) {
            return true;
        }

        if (preg_match('/\b(what|which|tell me about|explain|describe|about)\b.{0,40}\bthis\s+(software|platform|app|application|system|tool|product|service)\b/i', $normalized) === 1) {
            return true;
        }

        if (preg_match('/\bwhat\s+(?:can|does|do)\s+(?:this|the)\s+(?:software|platform|app|application|system|tool)\b/i', $normalized) === 1) {
            return true;
        }

        if (preg_match('/\b(what|which)\s+(features?|modules?|capabilities)\b/i', $normalized) === 1
            && preg_match('/\b(this|factory\s*23|the (?:software|platform|app|system|product)|available|are there|do (?:we|you) have)\b/i', $normalized) === 1
        ) {
            return true;
        }

        return false;
    }

    private function degradedModeMessage(?AiGenerationResult $result = null): string
    {
        $errorClass = strtolower(trim((string) ($result?->errorClass ?? '')));
        $isNvidiaTimeout = $result?->provider === 'nvidia'
            && in_array($errorClass, ['timeout', 'unreachable'], true);
        $isGlmTimeout = $result?->provider === 'glm'
            && in_array($errorClass, ['timeout', 'unreachable'], true);

        if ($isNvidiaTimeout) {
            return 'NVIDIA NIM took too long to respond — the hosted API catalog can be slow under load. Try again in a moment, or switch the AI stack to OpenAI + Claude in Admin → AI for faster day-to-day chat. I can still run dashboard queries if you ask specifically, for example: "show overdue tasks", "plan my day", or "list my CRM leads".';
        }

        if ($isGlmTimeout) {
            return 'GLM took too long to respond. Try again in a moment, or switch the AI stack in Admin → AI (OpenAI + Claude or NVIDIA NIM). I can still run dashboard queries if you ask specifically, for example: "show overdue tasks", "plan my day", or "list my CRM leads".';
        }

        return 'ELY is running in limited mode right now because the AI provider is temporarily unavailable. I can still run dashboard queries if you ask specifically, for example: "show overdue tasks", "plan my day", or "list my CRM leads".';
    }

    private function responseClaimsExecutedAction(string $text): bool
    {
        $normalized = strtolower($text);

        if (
            str_contains($normalized, 'executing task creation')
            || str_contains($normalized, 'task created successfully')
            || str_contains($normalized, 'meeting scheduled successfully')
            || str_contains($normalized, 'kpi') && str_contains($normalized, 'was created successfully')
        ) {
            return true;
        }

        return preg_match('/\b(task|meeting|lead|kpi|project)\b.{0,60}\b(created|scheduled|saved|assigned|live)\b/i', $normalized) === 1
            && ! str_contains($normalized, 'ready to')
            && ! str_contains($normalized, 'prepare')
            && ! str_contains($normalized, 'confirmation');
    }

    /**
     * @param array<int,array{role?:string,content?:string}> $recentMessages
     */
    private function formatRecentMessagesForPrompt(array $recentMessages): string
    {
        return collect($recentMessages)
            ->map(static fn(array $msg): string => sprintf(
                '[%s] %s',
                (string) ($msg['role'] ?? 'assistant'),
                (string) ($msg['content'] ?? '')
            ))
            ->implode("\n");
    }


    private function inferActionArgs(
        string $message,
        string $tool,
        int $companyId,
        array $actionArgs,
        ?string $threadId,
        int $userId,
        string $role,
        ?string $clientTimezone = null,
        ?string $companyCountry = null,
        ?string $rawUserMessage = null,
    ): array {
        $context = $this->conversationMemoryService->buildPromptContext($companyId, $userId, $threadId);
        $entities = is_array($context['entities'] ?? null) ? $context['entities'] : [];
        $normalized = trim($message);
        $correctionMessage = is_string($rawUserMessage) && trim($rawUserMessage) !== ''
            ? trim($rawUserMessage)
            : $normalized;

        if ($actionArgs !== []) {
            return $this->normalizeProvidedActionArgs(
                $tool,
                $message,
                $companyId,
                $entities,
                $actionArgs,
                $clientTimezone,
                $companyCountry,
                $role,
                $userId,
            );
        }

        // Patch the latest unconfirmed draft when the user sends a conversational correction.
        if (is_string($threadId) && $threadId !== '') {
            $pendingDraft = $this->actionDraftStore->get($companyId, $userId, $threadId);
            if (
                is_array($pendingDraft)
                && ($pendingDraft['tool'] ?? null) === $tool
                && $this->taskInferenceService->looksLikeCorrection($correctionMessage)
            ) {
                if ($tool === 'tasks.create') {
                    $patched = $this->taskInferenceService->patchFromCorrection(
                        $correctionMessage,
                        is_array($pendingDraft['action_args'] ?? null) ? $pendingDraft['action_args'] : [],
                        $companyId,
                        $role,
                    );

                    return $this->taskInferenceService->normalizeProvidedArgs(
                        $correctionMessage,
                        $companyId,
                        $entities,
                        $patched,
                        $role,
                    );
                }

                // Generic field overlays for other tools (location/title/reason style corrections).
                $patched = is_array($pendingDraft['action_args'] ?? null) ? $pendingDraft['action_args'] : [];
                if (preg_match('/\b(?:change|update|set)\s+(?:the\s+)?title\s*(?:to|=|:)?\s*(.+)$/i', $correctionMessage, $m) === 1) {
                    $patched['title'] = trim((string) $m[1]);
                    $patched['name'] = $patched['title'];
                }
                if ($tool === 'tasks.reassign') {
                    return $this->taskReassignInferenceService->normalizeProvidedArgs(
                        $companyId,
                        array_merge($patched, $this->taskReassignInferenceService->infer($correctionMessage, $companyId, $entities)),
                    );
                }
                if ($tool === 'crm.log_visit') {
                    return $this->visitLogInferenceService->normalizeProvidedArgs(
                        $companyId,
                        array_merge($patched, $this->visitLogInferenceService->infer($correctionMessage, $companyId, $entities)),
                    );
                }

                return $this->normalizeProvidedActionArgs(
                    $tool,
                    $correctionMessage,
                    $companyId,
                    $entities,
                    $patched,
                    $clientTimezone,
                    $companyCountry,
                    $role,
                    $userId,
                );
            }
        }

        return match ($tool) {
            'tasks.create' => $this->taskInferenceService->infer(
                message: $message,
                companyId: $companyId,
                entities: $entities,
                role: $role,
                userId: $userId,
                conversationSummary: (string) ($context['summary'] ?? ''),
            ),
            'tasks.reassign' => $this->taskReassignInferenceService->infer($message, $companyId, $entities),
            'crm.log_visit' => $this->visitLogInferenceService->infer($message, $companyId, $entities),
            'projects.create' => $this->inferProjectCreateArgs($message, $entities),
            'meetings.schedule' => $this->meetingInferenceService->infer(
                message: $message,
                companyId: $companyId,
                entities: $entities,
                conversationSummary: (string) ($context['summary'] ?? ''),
                clientTimezone: $clientTimezone,
                companyCountry: $companyCountry,
            ),
            'notifications.send' => $this->notificationInferenceService->infer(
                message: $message,
                companyId: $companyId,
                userId: $userId,
                threadId: $threadId,
                conversationSummary: (string) ($context['summary'] ?? ''),
                companyName: (string) (\App\Models\Company::query()->find($companyId)?->name ?? 'your organization'),
            ),
            'crm.create_lead' => $this->leadInferenceService->infer(
                message: $message,
                companyId: $companyId,
                userId: $userId,
                role: $role,
                entities: $entities,
                conversationSummary: (string) ($context['summary'] ?? ''),
            ),
            'crm.send_email' => $this->emailInferenceService->infer(
                message: $message,
                companyId: $companyId,
                entities: $entities,
                conversationSummary: (string) ($context['summary'] ?? ''),
                userId: $userId,
                threadId: $threadId,
            ),
            'kpis.create' => $this->kpiInferenceService->infer(
                message: $message,
                companyId: $companyId,
                entities: $entities,
                conversationSummary: (string) ($context['summary'] ?? ''),
            ),
            'org.users.create' => $this->internalUserInferenceService->infer(
                message: $message,
                companyId: $companyId,
                entities: $entities,
            ),
            default => $actionArgs,
        };
    }

    /**
     * @param array<string,string> $entities
     * @param array<string,mixed> $actionArgs
     * @return array<string,mixed>
     */
    private function normalizeProvidedActionArgs(
        string $tool,
        string $message,
        int $companyId,
        array $entities,
        array $actionArgs,
        ?string $clientTimezone = null,
        ?string $companyCountry = null,
        string $role = 'admin',
        int $userId = 0,
    ): array {
        if ($tool === 'tasks.create') {
            return $this->taskInferenceService->normalizeProvidedArgs($message, $companyId, $entities, $actionArgs, $role);
        }

        if ($tool === 'tasks.reassign') {
            return $this->taskReassignInferenceService->normalizeProvidedArgs($companyId, $actionArgs);
        }

        if ($tool === 'crm.log_visit') {
            return $this->visitLogInferenceService->normalizeProvidedArgs($companyId, $actionArgs);
        }

        if ($tool === 'projects.create') {
            return $this->normalizeProjectCreateArgs($actionArgs);
        }

        if ($tool === 'meetings.schedule') {
            return $this->meetingInferenceService->normalizeProvidedArgs(
                $message,
                $companyId,
                $actionArgs,
                $clientTimezone,
                $companyCountry,
            );
        }

        if ($tool === 'crm.create_lead') {
            return $this->leadInferenceService->normalizeProvidedArgs(
                $companyId,
                $actionArgs,
                $role,
                $userId,
            );
        }

        if ($tool === 'crm.send_email') {
            return $this->emailInferenceService->normalizeProvidedArgs($companyId, $actionArgs, $userId);
        }

        if ($tool === 'kpis.create') {
            return $this->kpiInferenceService->normalizeProvidedArgs(
                $companyId,
                $actionArgs,
            );
        }

        if ($tool === 'notifications.send') {
            return $this->notificationInferenceService->normalizeProvidedArgs($companyId, $actionArgs);
        }

        if ($tool === 'org.users.create') {
            return $this->internalUserInferenceService->normalizeProvidedArgs($companyId, $actionArgs);
        }

        return $actionArgs;
    }

    /**
     * @param  array<string, string>  $entities
     * @return array<string, mixed>
     */
    private function inferProjectCreateArgs(string $message, array $entities = []): array
    {
        $name = $this->extractLabeledValue($message, ['project name', 'name'])
            ?? (preg_match('/\b(?:create|add|new)\s+(?:a\s+)?project\s+(?:called|named)?\s*[\"\']?(.+?)[\"\']?(?=\s+(?:with|for|starting|from|type|status|priority|description|due|and)\b|[.,;]|$)/i', $message, $m) === 1
                ? trim((string) $m[1])
                : null);

        if (! is_string($name) || trim($name) === '') {
            $name = 'New Project';
        }

        $description = $this->extractLabeledValue($message, ['description', 'notes'])
            ?? 'Project created by ELY';

        $type = $this->extractLabeledValue($message, ['type', 'project type']);
        $status = $this->extractLabeledValue($message, ['status']);
        $priority = $this->extractLabeledValue($message, ['priority']);
        $startDate = $this->extractLabeledValue($message, ['start date', 'starts']);
        $endDate = $this->extractLabeledValue($message, ['end date', 'ends', 'due']);

        return array_filter([
            'name' => Str::limit(trim($name), 255, ''),
            'description' => Str::limit(trim((string) $description), 5000, ''),
            'type' => is_string($type) ? Str::limit(trim($type), 100, '') : null,
            'status' => is_string($status) ? Str::limit(trim($status), 100, '') : null,
            'priority' => is_string($priority) ? Str::limit(trim($priority), 50, '') : null,
            'start_date' => is_string($startDate) && trim($startDate) !== ''
                ? $this->resolveDueDate(trim($startDate))
                : now()->toDateString(),
            'end_date' => is_string($endDate) && trim($endDate) !== '' ? $this->resolveDueDate(trim($endDate)) : null,
            'notes' => $this->extractLabeledValue($message, ['notes']),
            'territory_zone' => $this->extractLabeledValue($message, ['zone', 'territory', 'territory zone']),
            'assigned_team' => isset($entities['team']) ? (string) $entities['team'] : $this->extractLabeledValue($message, ['team', 'assigned team']),
        ], static fn ($value): bool => $value !== null && $value !== '');
    }

    /**
     * @param  array<string, mixed>  $actionArgs
     * @return array<string, mixed>
     */
    private function normalizeProjectCreateArgs(array $actionArgs): array
    {
        $normalized = $actionArgs;

        foreach (['name', 'type', 'status', 'priority', 'territory_zone'] as $field) {
            if (is_string($normalized[$field] ?? null)) {
                $normalized[$field] = Str::limit(trim((string) $normalized[$field]), $field === 'name' ? 255 : 100, '');
            }
        }

        foreach (['description', 'notes', 'assigned_team'] as $field) {
            if (is_string($normalized[$field] ?? null)) {
                $normalized[$field] = Str::limit(trim((string) $normalized[$field]), 5000, '');
            }
        }

        if (is_string($normalized['start_date'] ?? null) && trim((string) $normalized['start_date']) !== '') {
            $normalized['start_date'] = $this->resolveDueDate(trim((string) $normalized['start_date']));
        } elseif (! isset($normalized['start_date'])) {
            $normalized['start_date'] = now()->toDateString();
        }

        if (is_string($normalized['end_date'] ?? null) && trim((string) $normalized['end_date']) !== '') {
            $normalized['end_date'] = $this->resolveDueDate(trim((string) $normalized['end_date']));
        }

        if (isset($normalized['project_manager_user_id']) && is_numeric($normalized['project_manager_user_id'])) {
            $normalized['project_manager_user_id'] = (int) $normalized['project_manager_user_id'];
        }

        if (! is_string($normalized['name'] ?? null) || trim((string) $normalized['name']) === '') {
            $normalized['name'] = 'New Project';
        }

        return $normalized;
    }

    /**
     * @param array<string,mixed> $actionArgs
     * @return array<string,mixed>
     */
    private function sanitizeActionArgs(array $actionArgs): array
    {
        $sanitized = [];

        foreach ($actionArgs as $key => $value) {
            if (is_string($key) && str_starts_with($key, '__')) {
                continue;
            }

            if (is_array($value)) {
                $sanitized[$key] = $this->sanitizeActionArgs($value);
                continue;
            }

            $sanitized[$key] = $value;
        }

        return $sanitized;
    }


    private function extractVisitLocationFromSentence(string $message): ?string
    {
        if (preg_match('/\bto\s+visit\s+(.+?)(?=[\.,;]|$|\n|due|priority)/i', $message, $match) === 1) {
            return trim((string) $match[1]);
        }

        if (preg_match('/\bvisit\s+(.+?)(?=[\.,;]|$|\n|due|priority)/i', $message, $match) === 1) {
            return trim((string) $match[1]);
        }

        return null;
    }

    private function extractTaskTitleFromSentence(string $message): ?string
    {
        if (preg_match('/\b(?:task\s+title|title)\b\s*[:\-]?\s*["“](.+?)["”]/i', $message, $m) === 1) {
            return trim((string) $m[1]);
        }

        if (preg_match('/\btask\s+title\s*:\s*([^\.\n]+)/i', $message, $m) === 1) {
            return trim((string) $m[1]);
        }

        if (preg_match('/\bcreate\s+(a\s+)?task\b[:\-\s]*(.+?)(?=\.|\n|task\s+type\s*:|description\s*:|assign\s+to\b|due\s+date\s*:|$)/i', $message, $m) === 1) {
            $candidate = trim((string) $m[2]);
            if ($candidate !== '' && preg_match('/^assign\s+to\b/i', $candidate) !== 1) {
                return $candidate;
            }
        }

        if (preg_match('/\bto\s+(visit|deliver|inspect|collect)\s+(.+?)(?=[\.,;]|$|\n|due|priority)/i', $message, $m) === 1) {
            $verb = ucfirst(strtolower(trim((string) $m[1])));
            $target = trim((string) $m[2]);

            return $target !== '' ? "{$verb} {$target}" : null;
        }

        if (preg_match('/\btask\s+for\s+[a-z][a-z\-]*(?:\s+[a-z][a-z\-]*)?\s+to\s+(.+?)(?=[\.,;]|$)/i', $message, $m) === 1) {
            $candidate = trim((string) $m[1]);

            return $candidate !== '' ? ucfirst($candidate) : null;
        }

        return null;
    }

    /**
     * @param array<int,string> $labels
     */
    private function extractLabeledValue(string $message, array $labels): ?string
    {
        foreach ($labels as $label) {
            $escaped = preg_quote($label, '/');
            $pattern = '/\b' . $escaped . '\b\s*:\s*(.+?)(?=\s*(?:[a-z][a-z\s&\/]{1,30}\s*:|\.|;|\n|$))/i';
            if (preg_match($pattern, $message, $m) === 1) {
                $value = $this->stripWrappingQuotes(trim((string) $m[1]));
                if ($value !== '') {
                    return $value;
                }
            }
        }

        return null;
    }

    private function stripWrappingQuotes(string $value): string
    {
        $trimmed = trim($value);
        if (
            (str_starts_with($trimmed, '"') && str_ends_with($trimmed, '"'))
            || (str_starts_with($trimmed, "'") && str_ends_with($trimmed, "'"))
        ) {
            return trim(substr($trimmed, 1, -1));
        }

        return $trimmed;
    }

    /**
     * @return array{value:string,raw_unrecognized:bool}
     */
    private function resolveTaskType(?string $rawType): array
    {
        if (! is_string($rawType) || trim($rawType) === '') {
            return [
                'value' => TaskType::INSPECTION->value,
                'raw_unrecognized' => false,
            ];
        }

        $normalized = strtolower(trim($rawType));
        $map = [
            'sales visit' => TaskType::SALES_VISIT->value,
            'sales_visit' => TaskType::SALES_VISIT->value,
            'inspection' => TaskType::INSPECTION->value,
            'delivery' => TaskType::DELIVERY->value,
            'collection' => TaskType::COLLECTION->value,
            'awareness' => TaskType::AWARENESS->value,
        ];

        if (array_key_exists($normalized, $map)) {
            return [
                'value' => $map[$normalized],
                'raw_unrecognized' => false,
            ];
        }

        return [
            'value' => TaskType::INSPECTION->value,
            'raw_unrecognized' => true,
        ];
    }

    private function resolveDueDate(?string $dueDateText): string
    {
        if (is_string($dueDateText) && trim($dueDateText) !== '') {
            $text = strtolower(trim($dueDateText));

            if (preg_match('/\btomorrow(?:\s+(morning|afternoon|evening|night))?\b/i', $text, $m) === 1) {
                $candidate = now()->addDay();
                $part = strtolower((string) ($m[1] ?? ''));
                $candidate = match ($part) {
                    'morning' => $candidate->setTime(9, 0),
                    'afternoon' => $candidate->setTime(14, 0),
                    'evening' => $candidate->setTime(18, 0),
                    'night' => $candidate->setTime(20, 0),
                    default => $candidate->setTime(17, 0),
                };

                return $candidate->toDateTimeString();
            }

            if (preg_match('/\btoday(?:\s+(morning|afternoon|evening|night))?\b/i', $text, $m) === 1) {
                $candidate = now();
                $part = strtolower((string) ($m[1] ?? ''));
                $candidate = match ($part) {
                    'morning' => $candidate->setTime(9, 0),
                    'afternoon' => $candidate->setTime(14, 0),
                    'evening' => $candidate->setTime(18, 0),
                    'night' => $candidate->setTime(20, 0),
                    default => $candidate->setTime(17, 0),
                };

                if ($candidate->lessThanOrEqualTo(now())) {
                    $candidate = $candidate->addDay();
                }

                return $candidate->toDateTimeString();
            }

            if (preg_match('/\bin\s+(\d{1,2})\s+days?\b/i', $text, $m) === 1) {
                $days = max(1, (int) $m[1]);
                return now()->addDays($days)->setTime(17, 0)->toDateTimeString();
            }

            if (preg_match('/\b(\d{1,2})(?:st|nd|rd|th)?\s+of\s+this\s+month\b/i', $text, $m) === 1) {
                $day = max(1, min(28, (int) $m[1]));
                $candidate = now()->startOfMonth()->addDays($day - 1)->setTime(17, 0);
                if ($candidate->lessThanOrEqualTo(now())) {
                    $candidate = $candidate->addMonth();
                }

                return $candidate->toDateTimeString();
            }

            try {
                $candidate = Carbon::parse($text);
                if ($candidate->hour === 0 && $candidate->minute === 0 && $candidate->second === 0) {
                    $candidate = $candidate->setTime(17, 0);
                }
                if ($candidate->lessThanOrEqualTo(now())) {
                    $candidate = $candidate->addDay();
                }

                return $candidate->toDateTimeString();
            } catch (Throwable) {
                // Fall through to default below.
            }
        }

        return now()->addDay()->setTime(17, 0)->toDateTimeString();
    }

    /**
     * @param array<string,string> $entities
     */
    private function resolveAgentIdForTaskMessage(string $message, int $companyId, array $entities): ?int
    {
        if (preg_match('/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i', $message, $emailMatch) === 1) {
            $email = trim((string) $emailMatch[0]);
            $byEmail = $this->resolveAgentIdFromAssigneeToken($email, $companyId);
            if ($byEmail !== null) {
                return $byEmail;
            }
        }

        if (preg_match('/\bassign\s*to\s*:\s*([^\.\n]+)/i', $message, $m) === 1) {
            $candidate = $this->normalizeAssigneeCandidate((string) $m[1]);

            if ($candidate !== '') {
                $byName = $this->resolveAgentIdFromAssigneeToken($candidate, $companyId);
                if ($byName !== null) {
                    return $byName;
                }
            }
        }

        if (preg_match('/\bassign\s+to\s+([^\.\n,;]+)/i', $message, $m) === 1) {
            $candidate = $this->normalizeAssigneeCandidate((string) $m[1]);

            if ($candidate !== '') {
                $byName = $this->resolveAgentIdFromAssigneeToken($candidate, $companyId);
                if ($byName !== null) {
                    return $byName;
                }
            }
        }

        if (preg_match('/\btask\s+for\s+(?:for\s+)?([a-z][a-z\-]*(?:\s+[a-z][a-z\-]*){0,2})\b/i', $message, $m) === 1) {
            $candidate = trim((string) $m[1]);
            if ($candidate !== '') {
                $byName = $this->resolveAgentIdFromAssigneeToken($candidate, $companyId);
                if ($byName !== null) {
                    return $byName;
                }
            }
        }

        if (preg_match('/\bfor\s+(?:for\s+)?([a-z][a-z\-]*(?:\s+[a-z][a-z\-]*){0,2})\s+to\b/i', $message, $m) === 1) {
            $candidate = trim((string) $m[1]);
            if ($candidate !== '') {
                $byName = $this->resolveAgentIdFromAssigneeToken($candidate, $companyId);
                if ($byName !== null) {
                    return $byName;
                }
            }
        }

        return $this->resolveAgentIdFromMessage($message, $companyId, $entities);
    }

    private function normalizeAssigneeCandidate(string $raw): string
    {
        $candidate = trim($raw);
        if ($candidate === '') {
            return '';
        }

        // "assign to Jane Doe due tomorrow" — stop before task metadata when no delimiter.
        $candidate = preg_replace('/\s+(?:due|by|on|location|address|priority|description|title|type)\b.*/i', '', $candidate) ?? $candidate;
        $candidate = preg_replace('/\((.*?)\)/', '', $candidate) ?? $candidate;
        $candidate = preg_replace('/\bagent\s+/i', '', $candidate) ?? $candidate;

        return trim($candidate);
    }

    private function resolveAgentIdFromAssigneeToken(string $token, int $companyId): ?int
    {
        $candidate = trim($token);
        if ($candidate === '') {
            return null;
        }

        if (preg_match('/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i', $candidate) === 1) {
            $byEmail = User::query()
                ->whereHas('companies', static fn($q) => $q->where('companies.id', $companyId))
                ->where('email', $candidate)
                ->value('id');

            return is_numeric($byEmail) ? (int) $byEmail : null;
        }

        $byName = User::query()
            ->whereHas('companies', static fn($q) => $q->where('companies.id', $companyId))
            ->where('name', 'like', '%' . $candidate . '%')
            ->value('id');

        return is_numeric($byName) ? (int) $byName : null;
    }

    private function extractDueDateHintFromSentence(string $message): ?string
    {
        if (preg_match('/\b(?:due|by|for)\s+(tomorrow(?:\s+(?:morning|afternoon|evening|night))?)\b/i', $message, $m) === 1) {
            return trim((string) $m[1]);
        }

        if (preg_match('/\b(?:due|by|for)\s+(today(?:\s+(?:morning|afternoon|evening|night))?)\b/i', $message, $m) === 1) {
            return trim((string) $m[1]);
        }

        if (preg_match('/\b(?:due|by|for)\s+(next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i', $message, $m) === 1) {
            return trim((string) $m[1]);
        }

        if (preg_match('/\b(?:do\s+it|should\s+do\s+it|complete\s+it)\s+(tomorrow(?:\s+(?:morning|afternoon|evening|night))?)\b/i', $message, $m) === 1) {
            return trim((string) $m[1]);
        }

        if (preg_match('/\b(tomorrow(?:\s+(?:morning|afternoon|evening|night))?)\b/i', $message, $m) === 1) {
            return trim((string) $m[1]);
        }

        if (preg_match('/\bin\s+(\d{1,2})\s+days?\b/i', $message, $m) === 1) {
            return 'in ' . (int) $m[1] . ' days';
        }

        return null;
    }

    /**
     * @param array<string,mixed> $args
     * @param array<int,string> $warnings
     */
    private function buildActionPreviewSummary(string $tool, array $args, array $warnings = [], bool $blockingConfirmation = false): string
    {
        if ($tool === 'tasks.create') {
            $title = (string) ($args['title'] ?? 'Untitled Task');
            $type = (string) ($args['type'] ?? 'inspection');
            $location = (string) ($args['location'] ?? 'Operations Center');
            $due = (string) ($args['due_date'] ?? 'Not set');

            $base = sprintf(
                'ELY action ready: create task "%s" (%s) at %s, due %s. Click Confirm Action to proceed.',
                $title,
                $type,
                $location,
                $due,
            ) . ($warnings !== []
                ? ' Notes: ' . implode(' ', array_map(static fn(string $w): string => '[' . $w . ']', $warnings))
                : '');

            if ($blockingConfirmation) {
                $base .= ' Confirmation is currently blocked until the required fields are corrected.';
            }

            return $base;
        }

        if ($tool === 'tasks.reassign') {
            $taskId = (string) ($args['task_id'] ?? 'unknown');
            $toUser = (string) ($args['to_user_id'] ?? 'unassigned');
            $base = sprintf('ELY action ready: reassign task #%s to user %s. Click Confirm Action to proceed.', $taskId, $toUser);
            if ($warnings !== []) {
                $base .= ' Notes: ' . implode(' ', array_map(static fn(string $w): string => '[' . $w . ']', $warnings));
            }
            if ($blockingConfirmation) {
                $base .= ' Confirmation is currently blocked until task and assignee are set.';
            }

            return $base;
        }

        if ($tool === 'crm.log_visit') {
            $leadId = (string) ($args['lead_id'] ?? 'unknown');
            $summary = Str::limit((string) ($args['summary'] ?? ''), 80, '…');
            $base = sprintf('ELY action ready: log visit for lead #%s (%s). Click Confirm Action to proceed.', $leadId, $summary !== '' ? $summary : 'no summary');
            if ($warnings !== []) {
                $base .= ' Notes: ' . implode(' ', array_map(static fn(string $w): string => '[' . $w . ']', $warnings));
            }
            if ($blockingConfirmation) {
                $base .= ' Confirmation is currently blocked until lead and summary are set.';
            }

            return $base;
        }

        if ($tool === 'projects.create') {
            $name = (string) ($args['name'] ?? 'New Project');
            $base = sprintf('ELY action ready: create project "%s". Click Confirm Action to proceed.', $name);
            if ($warnings !== []) {
                $base .= ' Notes: ' . implode(' ', array_map(static fn(string $w): string => '[' . $w . ']', $warnings));
            }

            return $base;
        }

        if ($tool === 'meetings.schedule') {
            return $this->meetingInferenceService->buildPreviewSummary($args, $warnings, $blockingConfirmation);
        }

        if ($tool === 'crm.create_lead') {
            return $this->leadInferenceService->buildPreviewSummary($args, $warnings, $blockingConfirmation);
        }

        if ($tool === 'kpis.create') {
            return $this->kpiInferenceService->buildPreviewSummary($args, $warnings, $blockingConfirmation);
        }

        if ($tool === 'notifications.send') {
            return $this->notificationInferenceService->buildPreviewSummary($args, $warnings, $blockingConfirmation);
        }

        if ($tool === 'org.users.create') {
            return $this->internalUserInferenceService->buildPreviewSummary($args, $warnings, $blockingConfirmation);
        }

        return 'ELY prepared an action. Review and click Confirm Action to proceed.';
    }

    /**
     * @param array<string,mixed> $args
     * @return array<int,string>
     */
    private function inferActionWarnings(string $tool, array $args, string $role = 'admin'): array
    {
        $codes = $this->inferActionWarningCodes($tool, $args, $role);
        if ($codes === []) {
            return [];
        }

        $map = [
            'assignee_unresolved' => 'No matching assignee was found in your company. Please verify the agent name or email.',
            'raw_type_unrecognized' => 'Task type was not recognized and defaulted to inspection.',
            'used_default_due_date' => 'Due date was not clear and defaulted to tomorrow 5:00 PM.',
            'used_default_title' => 'Task title was not clearly detected; please confirm before proceeding.',
            'used_default_time' => 'Meeting time was not clear and defaulted to tomorrow at 10:00 AM.',
            'attendee_unresolved' => 'Some attendee names could not be matched to organization users. Please verify internal attendees before confirming.',
            'invalid_attendee_email' => 'One or more attendee emails are invalid. Please correct them before confirming.',
            'missing_lead_name' => 'Lead business name is required before this lead can be saved.',
            'missing_phone' => 'Phone number was not detected. Add a phone number before confirming.',
            'missing_location' => 'Location was not detected. Add a location before confirming.',
            'missing_kpi_name' => 'KPI name is required before this KPI can be saved.',
            'missing_objective' => 'KPI objective is required and must be at least 10 characters.',
            'missing_target_value' => 'Target value was not detected. Add a measurable target before confirming.',
            'missing_expected_outcome' => 'Expected outcome is required and must be at least 10 characters.',
            'used_default_dates' => 'Start or end date was not clear and defaulted to the next month.',
            'recipients_unresolved' => 'No matching recipients were found. Please verify agent names or select recipients before confirming.',
            'message_too_generic' => 'The reminder message is too generic. Edit it to describe the overdue tasks before confirming.',
            'lead_unresolved' => 'No matching CRM lead was found. Select the correct lead before confirming.',
            'recipient_email_missing' => 'This lead does not have a recipient email yet. Add an email address before confirming.',
            'missing_full_name' => 'Full name is required to create this organization user.',
            'missing_email' => 'A valid email address is required to create this organization user.',
            'missing_supervisor' => 'Agents must be assigned to a supervisor before confirming.',
            'missing_zone' => 'At least one assigned zone is required for this organization user.',
            'missing_summary' => 'Visit summary is required before this visit can be logged.',
            'task_unresolved' => 'Task ID could not be resolved. Provide a valid task before confirming.',
            'assignee_ambiguous' => 'Multiple assignees matched that name. Choose the exact agent before confirming.',
        ];

        return collect($codes)
            ->map(static fn(string $code): string => $map[$code] ?? $code)
            ->values()
            ->all();
    }

    /**
     * @param array<string,mixed> $args
     * @return array<int,string>
     */
    private function inferActionWarningCodes(string $tool, array $args, string $role = 'admin'): array
    {
        if ($tool === 'meetings.schedule') {
            return $this->meetingInferenceService->warningCodes($args);
        }

        if ($tool === 'crm.create_lead') {
            return $this->leadInferenceService->warningCodes($args);
        }

        if ($tool === 'kpis.create') {
            return $this->kpiInferenceService->warningCodes($args);
        }

        if ($tool === 'notifications.send') {
            return $this->notificationInferenceService->warningCodes($args);
        }

        if ($tool === 'org.users.create') {
            return $this->internalUserInferenceService->warningCodes($args);
        }

        if ($tool === 'crm.send_email') {
            return $this->emailInferenceService->warningCodes($args);
        }

        if ($tool === 'tasks.create') {
            return $this->taskInferenceService->warningCodes($args, $role);
        }

        if ($tool === 'tasks.reassign') {
            return $this->taskReassignInferenceService->warningCodes($args);
        }

        if ($tool === 'crm.log_visit') {
            return $this->visitLogInferenceService->warningCodes($args);
        }

        return [];
    }

    /**
     * @param array<int,string> $validationWarningCodes
     * @return array<int,string>
     */
    private function determineBlockingWarningCodes(array $validationWarningCodes): array
    {
        $blockingCodes = [];

        if (in_array('assignee_unresolved', $validationWarningCodes, true)) {
            $blockingCodes[] = 'assignee_unresolved';
        }

        if (in_array('invalid_attendee_email', $validationWarningCodes, true)) {
            $blockingCodes[] = 'invalid_attendee_email';
        }

        if (in_array('missing_lead_name', $validationWarningCodes, true)) {
            $blockingCodes[] = 'missing_lead_name';
        }

        if (in_array('missing_objective', $validationWarningCodes, true)) {
            $blockingCodes[] = 'missing_objective';
        }

        if (in_array('missing_target_value', $validationWarningCodes, true)) {
            $blockingCodes[] = 'missing_target_value';
        }

        if (in_array('missing_expected_outcome', $validationWarningCodes, true)) {
            $blockingCodes[] = 'missing_expected_outcome';
        }

        if (in_array('missing_kpi_name', $validationWarningCodes, true)) {
            $blockingCodes[] = 'missing_kpi_name';
        }

        if (in_array('recipients_unresolved', $validationWarningCodes, true)) {
            $blockingCodes[] = 'recipients_unresolved';
        }

        if (in_array('message_too_generic', $validationWarningCodes, true)) {
            $blockingCodes[] = 'message_too_generic';
        }

        if (in_array('lead_unresolved', $validationWarningCodes, true)) {
            $blockingCodes[] = 'lead_unresolved';
        }

        if (in_array('recipient_email_missing', $validationWarningCodes, true)) {
            $blockingCodes[] = 'recipient_email_missing';
        }

        if (in_array('missing_full_name', $validationWarningCodes, true)) {
            $blockingCodes[] = 'missing_full_name';
        }

        if (in_array('missing_email', $validationWarningCodes, true)) {
            $blockingCodes[] = 'missing_email';
        }

        if (in_array('missing_supervisor', $validationWarningCodes, true)) {
            $blockingCodes[] = 'missing_supervisor';
        }

        if (in_array('missing_zone', $validationWarningCodes, true)) {
            $blockingCodes[] = 'missing_zone';
        }

        if (in_array('missing_summary', $validationWarningCodes, true)) {
            $blockingCodes[] = 'missing_summary';
        }

        if (in_array('task_unresolved', $validationWarningCodes, true)) {
            $blockingCodes[] = 'task_unresolved';
        }

        if (in_array('assignee_ambiguous', $validationWarningCodes, true)) {
            $blockingCodes[] = 'assignee_ambiguous';
        }

        if ((bool) config('services.ai.strict_confirmation_blocking', false)) {
            $strictCodes = config('services.ai.strict_confirmation_blocking_codes', ['used_default_title', 'used_default_due_date']);
            if (is_array($strictCodes)) {
                foreach ($strictCodes as $code) {
                    if (is_string($code) && in_array($code, $validationWarningCodes, true)) {
                        $blockingCodes[] = $code;
                    }
                }
            }
        }

        return array_values(array_unique($blockingCodes));
    }

    /**
     * Soft inference blockers should not abort an explicit confirmed payload when the
     * confirmer did not attempt the related field (e.g. optional assignee / unresolved zone name).
     *
     * @param  array<int, string>  $blockingCodes
     * @param  array<string, mixed>  $providedArgs
     * @return array<int, string>
     */
    private function filterConfirmedExecutionBlockers(string $tool, array $blockingCodes, array $providedArgs): array
    {
        $filtered = $blockingCodes;

        if ($tool === 'tasks.create' || $tool === 'tasks.reassign') {
            $attemptedAssignee = (is_string($providedArgs['assignee'] ?? null) && trim((string) $providedArgs['assignee']) !== '')
                || (isset($providedArgs['assigned_agent_id']) && $providedArgs['assigned_agent_id'] !== null && $providedArgs['assigned_agent_id'] !== '')
                || (isset($providedArgs['to_user_id']) && $providedArgs['to_user_id'] !== null && $providedArgs['to_user_id'] !== '');

            if (! $attemptedAssignee) {
                $filtered = array_values(array_filter(
                    $filtered,
                    static fn (string $code): bool => ! in_array($code, ['assignee_unresolved', 'assignee_ambiguous'], true),
                ));
            }
        }

        if ($tool === 'org.users.create') {
            $attemptedZone = (is_string($providedArgs['assigned_zone'] ?? null) && trim((string) $providedArgs['assigned_zone']) !== '')
                || (is_array($providedArgs['assigned_zone_ids'] ?? null) && $providedArgs['assigned_zone_ids'] !== []);

            if ($attemptedZone) {
                $filtered = array_values(array_filter(
                    $filtered,
                    static fn (string $code): bool => $code !== 'missing_zone',
                ));
            }
        }

        return $filtered;
    }

    /**
     * @param array<string,string> $entities
     */
    private function resolveAgentIdFromMessage(string $message, int $companyId, array $entities): ?int
    {
        $candidate = null;

        if (preg_match('/\bagent\s+([a-z][a-z\-]*(?:\s+[a-z][a-z\-]*){0,3})(?=\s+(?:to|for|on|at|by|with)\b|[\.,!?]|$)/i', $message, $m) === 1) {
            $candidate = trim((string) $m[1]);
        } elseif (is_string($entities['agent'] ?? null)) {
            $candidate = trim((string) $entities['agent']);
        }

        if ($candidate === null || $candidate === '') {
            return null;
        }

        return User::query()
            ->whereHas('companies', static fn($q) => $q->where('companies.id', $companyId))
            ->where('name', 'like', '%' . $candidate . '%')
            ->value('id');
    }

    private function mapActionFailureMessage(Throwable $e, string $tool): string
    {
        if ($e instanceof ValidationException) {
            $firstError = collect($e->errors())
                ->flatten()
                ->filter(static fn(mixed $value): bool => is_string($value) && trim($value) !== '')
                ->first();

            return sprintf(
                'I could not execute %s because required details are missing or invalid: %s',
                $tool,
                is_string($firstError) ? $firstError : $e->getMessage(),
            );
        }

        return sprintf('I could not execute %s. No action was applied. Error: %s', $tool, $e->getMessage());
    }

    private function executeActionWithIdempotency(
        User $user,
        int $companyId,
        string $tool,
        array $actionArgs,
        ?string $idempotencyKey,
    ): array {
        $executionArgs = $actionArgs;
        unset($executionArgs['draft_id'], $executionArgs['draft_version'], $executionArgs['assignee']);

        if ($idempotencyKey === null || trim($idempotencyKey) === '') {
            return $this->actionToolRegistry->execute($tool, $user, $companyId, $executionArgs);
        }

        $cacheKey = sprintf(
            'copilot:action:idempotency:%d:%d:%s:%s',
            $companyId,
            (int) $user->id,
            $tool,
            sha1(trim($idempotencyKey))
        );

        $cached = Cache::get($cacheKey);
        if (is_array($cached)) {
            $cached['payload'] = [
                ...(is_array($cached['payload'] ?? null) ? $cached['payload'] : []),
                'idempotent_replay' => true,
            ];

            return $cached;
        }

        $result = $this->actionToolRegistry->execute($tool, $user, $companyId, $executionArgs);
        $result['payload'] = [
            ...(is_array($result['payload'] ?? null) ? $result['payload'] : []),
            'idempotent_replay' => false,
        ];

        Cache::put($cacheKey, $result, now()->addHour());

        return $result;
    }

    public function listThreads(User $user, ?int $companyId = null): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);

        return $this->conversationMemoryService->listThreads((int) $context['company']->id, (int) $user->id);
    }

    public function searchThreads(
        User $user,
        string $query,
        ?int $companyId = null,
        int $limit = 15,
        ?string $cursor = null,
    ): array {
        $context = $this->companyContextService->resolve($user, $companyId);

        return $this->conversationMemoryService->searchThreads(
            (int) $context['company']->id,
            (int) $user->id,
            $query,
            $limit,
            $cursor,
        );
    }

    public function getThread(User $user, string $threadId, ?int $companyId = null): ?array
    {
        $context = $this->companyContextService->resolve($user, $companyId);

        return $this->conversationMemoryService->getThread((int) $context['company']->id, (int) $user->id, $threadId);
    }

    public function deleteThread(User $user, string $threadId, ?int $companyId = null): bool
    {
        $context = $this->companyContextService->resolve($user, $companyId);

        return $this->conversationMemoryService->deleteThread((int) $context['company']->id, (int) $user->id, $threadId);
    }

    /**
     * @return array<int,array{id:int,name:string,email:string,role:string|null}>
     */
    public function lookupAssignees(User $user, ?int $companyId = null, ?string $query = null, int $limit = 8): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $search = trim((string) $query);
        $boundedLimit = max(1, min(20, $limit));

        $assignees = User::query()
            ->select(['users.id', 'users.name', 'users.email'])
            ->selectRaw('company_users.role as company_role')
            ->join(
                'company_users',
                static fn($join) => $join
                    ->on('company_users.user_id', '=', 'users.id')
                    ->where('company_users.company_id', '=', $resolvedCompanyId)
            )
            ->when($search !== '', function ($query) use ($search): void {
                $like = '%' . $search . '%';
                $query->where(static function ($nested) use ($like): void {
                    $nested->where('users.name', 'like', $like)
                        ->orWhere('users.email', 'like', $like);
                });
            })
            ->orderByRaw("case when company_users.role = 'agent' then 0 else 1 end")
            ->orderBy('users.name')
            ->limit($boundedLimit)
            ->get();

        return $assignees
            ->map(static fn(User $assignee): array => [
                'id' => (int) $assignee->id,
                'name' => (string) $assignee->name,
                'email' => (string) ($assignee->email ?? ''),
                'role' => is_string($assignee->company_role ?? null) ? (string) $assignee->company_role : null,
            ])
            ->values()
            ->all();
    }

    /**
     * @param  array<string, mixed>  $chatContext
     * @return array<string, mixed>
     */
    private function buildReadToolArgs(string $tool, array $chatContext): array
    {
        if ($tool !== 'planning.daily') {
            return [];
        }

        $args = [];
        if (isset($chatContext['latitude']) && is_numeric($chatContext['latitude'])) {
            $args['latitude'] = (float) $chatContext['latitude'];
        }
        if (isset($chatContext['longitude']) && is_numeric($chatContext['longitude'])) {
            $args['longitude'] = (float) $chatContext['longitude'];
        }
        if (isset($chatContext['focus']) && is_string($chatContext['focus'])) {
            $args['focus'] = $chatContext['focus'];
        }
        if (isset($chatContext['limit']) && is_numeric($chatContext['limit'])) {
            $args['limit'] = (int) $chatContext['limit'];
        }

        return $args;
    }

    /**
     * @return array<string, mixed>
     */
    private function buildReadToolMessageArgs(
        string $tool,
        string $message,
        string $role = 'admin',
        ?string $threadId = null,
        ?int $companyId = null,
        ?int $userId = null,
    ): array {
        if ($tool === 'crm.visit_extract') {
            return ['notes' => $message];
        }

        $args = $this->readToolArgsResolver->isListTool($tool)
            ? $this->readToolArgsResolver->resolve($tool, $message, $role, $threadId, $companyId, $userId)
            : [];

        if ($tool === 'crm.top_leads') {
            return array_merge($args, $this->crmLeadReadArgsResolver->resolveFilters($message));
        }

        if ($tool === 'drive.files') {
            return array_merge($args, ['message' => $message]);
        }

        return $args;
    }

    private function canConsumeCredits(int $companyId): bool
    {
        if ($this->demoCompanyService->isDemo($companyId)) {
            return true;
        }

        $limit = (int) config('services.ai.monthly_org_credit_limit', 0);
        if ($limit <= 0) {
            return true;
        }

        return ((int) Cache::get($this->monthlyCreditKey($companyId), 0)) < $limit;
    }

    private function registerCreditUsage(int $companyId, int $credits): void
    {
        if ($this->demoCompanyService->isDemo($companyId)) {
            return;
        }

        if ($credits <= 0) {
            return;
        }

        $limit = (int) config('services.ai.monthly_org_credit_limit', 0);
        if ($limit <= 0) {
            return;
        }

        $key = $this->monthlyCreditKey($companyId);
        $current = (int) Cache::get($key, 0);
        Cache::put($key, $current + $credits, now()->endOfMonth());
    }

    private function monthlyCreditKey(int $companyId): string
    {
        return sprintf('copilot:usage:%d:%s', $companyId, now()->format('Y_m'));
    }

    private function redactSensitiveText(string $text): string
    {
        if (! (bool) config('services.ai.pii_redaction_enabled', true)) {
            return $text;
        }

        if ($this->isIsoDateLikeString($text)) {
            return $text;
        }

        $redacted = preg_replace('/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i', '[redacted-email]', $text);
        $redacted = preg_replace('/\+?\d[\d\s\-()]{7,}\d/', '[redacted-phone]', (string) $redacted);

        return (string) $redacted;
    }

    private function isIsoDateLikeString(string $text): bool
    {
        $trimmed = trim($text);

        return preg_match('/^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/', $trimmed) === 1;
    }

    private function redactValue(mixed $value): mixed
    {
        if (is_string($value)) {
            return $this->redactSensitiveText($value);
        }

        if (is_array($value)) {
            $result = [];
            foreach ($value as $key => $item) {
                if (is_string($key) && $this->isRedactionExemptKey($key)) {
                    $result[$key] = $item;
                    continue;
                }

                $result[$key] = $this->redactValue($item);
            }

            return $result;
        }

        return $value;
    }

    private function isRedactionExemptKey(string $key): bool
    {
        return in_array($key, [
            'plan_date',
            'due_date',
            'due_at',
            'scheduled_start',
            'scheduled_end',
            'meeting_start_at',
            'kpi_end_date',
            'dedupe_key',
            'created_at',
            'updated_at',
        ], true);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function notifyDailyPlanReady(User $user, int $companyId, array $payload): void
    {
        $itemCount = is_array($payload['items'] ?? null) ? count($payload['items']) : 0;
        $creatableCount = (int) ($payload['acceptance']['creatable_count'] ?? 0);

        $this->notificationService->notifyUser((int) $user->id, [
            'company_id' => $companyId,
            'type' => 'daily_plan.ready',
            'category' => NotificationCategory::SYSTEM->value,
            'title' => 'Your daily plan is ready',
            'message' => $itemCount === 0
                ? 'ELY reviewed your schedule. Open the assistant to see your plan.'
                : sprintf(
                    'ELY planned %d item%s for today%s. Review and accept to add tasks.',
                    $itemCount,
                    $itemCount === 1 ? '' : 's',
                    $creatableCount > 0 ? " ({$creatableCount} can become tasks)" : '',
                ),
            'action_url' => '/assistant',
            'dedupe_key' => 'daily-plan-ready:' . $user->id . ':' . ($payload['plan_date'] ?? now()->toDateString()),
        ]);
    }
}
