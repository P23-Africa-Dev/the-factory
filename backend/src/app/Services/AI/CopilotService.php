<?php

declare(strict_types=1);

namespace App\Services\AI;

use App\Enums\TaskType;
use App\Models\User;
use App\Services\AI\Crm\EmailInferenceService;
use App\Services\AI\Crm\LeadInferenceService;
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
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

class CopilotService
{
    public function __construct(
        private readonly AiLoggingService $aiLoggingService,
        private readonly CompanyContextService $companyContextService,
        private readonly IntentClassifier $intentClassifier,
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
        private readonly NotificationService $notificationService,
        private readonly DemoCompanyService $demoCompanyService,
        private readonly LlmIntentRouter $llmIntentRouter,
        private readonly ReadToolSynthesisService $readToolSynthesisService,
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

        $intent = $this->intentClassifier->classify($message);
        $resolvedActionTool = $this->resolveActionToolFromMessage(
            $message,
            $threadId,
            $resolvedCompanyId,
            (int) $user->id,
        );

        if (($intent['type'] ?? 'general') === 'general' && $resolvedActionTool !== null) {
            $intent = [
                'type' => 'action',
                'tool' => $resolvedActionTool,
                'confidence' => 0.85,
            ];
        } elseif (($intent['type'] ?? 'general') === 'action' && ! is_string($intent['tool'] ?? null) && $resolvedActionTool !== null) {
            $intent['tool'] = $resolvedActionTool;
        }

        $resolvedReadTool = $this->resolveReadToolFromMessage($message);
        if (($intent['type'] ?? 'general') === 'general' && $resolvedReadTool !== null) {
            $intent = [
                'type' => 'tool',
                'tool' => $resolvedReadTool,
                'confidence' => 0.85,
            ];
        }

        if ($this->isNaturalLanguageConfirmation($message)) {
            $pendingTool = $this->resolvePendingActionToolFromThread($threadId, $resolvedCompanyId, (int) $user->id)
                ?? $this->resolveContextualActionToolFromThread($threadId, $resolvedCompanyId, (int) $user->id);

            if (is_string($pendingTool) && $pendingTool !== '') {
                $intent = [
                    'type' => 'action',
                    'tool' => $pendingTool,
                    'confidence' => 0.95,
                ];
                $actionConfirmed = true;
            }
        }

        if (($intent['type'] ?? 'general') === 'general' && $this->isTaskConversationFollowUp($message, $threadId, $resolvedCompanyId, (int) $user->id)) {
            $intent = [
                'type' => 'action',
                'tool' => 'tasks.create',
                'confidence' => 0.85,
            ];
        }

        if ($actionConfirmed && $actionArgs !== []) {
            $pendingTool = $this->resolvePendingActionToolFromThread($threadId, $resolvedCompanyId, (int) $user->id);
            if (is_string($pendingTool) && $pendingTool !== '') {
                $intent = [
                    'type' => 'action',
                    'tool' => $pendingTool,
                    'confidence' => 1.0,
                ];
            }
        }

        $actionMessage = $this->buildActionableMessage($message, $threadId, $resolvedCompanyId, (int) $user->id);

        $intent = $this->maybeEnhanceIntentWithLlmRouter(
            intent: $intent,
            message: $message,
            role: $role,
            threadId: $threadId,
            companyId: $resolvedCompanyId,
            userId: (int) $user->id,
            resolvedActionTool: $resolvedActionTool,
            resolvedReadTool: $resolvedReadTool,
        );

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
                        );
                        $validationWarningCodes = $this->inferActionWarningCodes($candidateTool, $inferredArgs, $role);
                        $validationWarnings = $this->inferActionWarnings($candidateTool, $inferredArgs, $role);
                        $blockingWarningCodes = $this->determineBlockingWarningCodes($validationWarningCodes);
                        $blockingConfirmation = $blockingWarningCodes !== [];
                        $toolResult = [
                            'summary' => $this->buildActionPreviewSummary($candidateTool, $inferredArgs, $validationWarnings, $blockingConfirmation),
                            'sources' => [$candidateTool],
                            'payload' => [
                                'confirmation_required' => true,
                                'tool' => $candidateTool,
                                'action_args' => $this->sanitizeActionArgs($inferredArgs),
                                'validation_warnings' => $validationWarnings,
                                'validation_warning_codes' => $validationWarningCodes,
                                'blocking_warning_codes' => $blockingWarningCodes,
                                'blocking_confirmation' => $blockingConfirmation,
                                'execution_model' => $routing['model'],
                            ],
                        ];
                    } else {
                        $resolvedActionArgs = $this->sanitizeActionArgs(
                            $this->inferActionArgs(
                                $actionMessage,
                                $candidateTool,
                                $resolvedCompanyId,
                                $actionArgs,
                                $threadId,
                                (int) $user->id,
                                $role,
                                $clientTimezone,
                                $companyCountry,
                            )
                        );
                        try {
                            $toolResult = $this->executeActionWithIdempotency(
                                user: $user,
                                companyId: $resolvedCompanyId,
                                tool: $candidateTool,
                                actionArgs: $resolvedActionArgs,
                                idempotencyKey: $idempotencyKey,
                            );
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
                } else {
                    $toolResult = $this->readToolRegistry->execute(
                        $candidateTool,
                        $user,
                        $resolvedCompanyId,
                        array_merge(
                            $this->buildReadToolArgs($candidateTool, $chatContext),
                            $this->buildReadToolMessageArgs($candidateTool, $message),
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
            );
            $assistantText = $generalResponse['text'];
        }

        if ((bool) config('services.ai.pii_redaction_enabled', true)) {
            $assistantText = $this->redactSensitiveText($assistantText);
            if (is_array($toolResult)) {
                $toolResult['payload'] = $this->redactValue($toolResult['payload'] ?? null);
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
    ): array {
        $normalized = strtolower(trim($message));
        $resolvedCompanyName = trim($companyName) !== '' ? $companyName : 'your active organization';
        $promptContext = $this->conversationMemoryService->buildPromptContext($companyId, $userId, $threadId);
        $contextEntities = is_array($promptContext['entities'] ?? null) ? $promptContext['entities'] : [];

        if ($this->looksLikeActionRequest($message) && $this->resolveActionToolFromMessage($message, $threadId, $companyId, $userId) === null) {
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

        if (str_contains($normalized, 'this software') || str_contains($normalized, 'what is factory23') || str_contains($normalized, 'what does this do')) {
            return ['text' => ElySystemPrompt::intro() . ' I can help with CRM summaries, overdue tasks, project risk status, attendance snapshots, meetings, and role-scoped live tracking insights.', 'result' => null];
        }

        $systemPrompt = ElySystemPrompt::core() . "\n\n" . ElySystemPrompt::fewShotExamples();
        $userPrompt = sprintf(
            "Company name: %s\nTenant scope ID (internal, do not mention): %d\nUser name: %s\nRole: %s\nConversation summary:\n%s\nRecent conversation:\n%s\nKnown entities: %s\nQuestion: %s",
            $this->redactSensitiveText($resolvedCompanyName),
            $companyId,
            $this->redactSensitiveText($user->name),
            $role,
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

        return ['text' => $this->degradedModeMessage(), 'result' => null];
    }

    private function degradedModeMessage(): string
    {
        return 'ELY is running in limited mode right now because the AI provider is temporarily unavailable. I can still run dashboard queries if you ask specifically, for example: "show overdue tasks", "plan my day", or "list my CRM leads".';
    }

    /**
     * @param  array{type:string,tool:?string,confidence:float}  $intent
     * @return array{type:string,tool:?string,confidence:float}
     */
    private function maybeEnhanceIntentWithLlmRouter(
        array $intent,
        string $message,
        string $role,
        ?string $threadId,
        int $companyId,
        int $userId,
        ?string $resolvedActionTool,
        ?string $resolvedReadTool,
    ): array {
        if (! (bool) config('services.ai.enable_hybrid_router', true)) {
            return $intent;
        }

        $confidence = (float) ($intent['confidence'] ?? 0.4);
        $intentType = (string) ($intent['type'] ?? 'general');
        $needsRouter = ($intentType === 'general' && $resolvedActionTool === null && $resolvedReadTool === null)
            || ($confidence < 0.9 && in_array($intentType, ['general', 'tool', 'action'], true))
            || ($this->looksLikeActionRequest($message) && $resolvedActionTool === null);

        if (! $needsRouter) {
            return $intent;
        }

        $promptContext = $this->conversationMemoryService->buildPromptContext($companyId, $userId, $threadId);
        $recentMessages = is_array($promptContext['recent_messages'] ?? null) ? $promptContext['recent_messages'] : [];
        $route = $this->llmIntentRouter->route($message, $role, $recentMessages, $companyId, $userId, $threadId);
        if ($route === null) {
            return $intent;
        }

        $routeConfidence = (float) ($route['confidence'] ?? 0.0);
        if ($routeConfidence < 0.7) {
            return $intent;
        }

        $routeType = (string) ($route['type'] ?? 'chat');
        if ($routeType === 'chat') {
            return [
                'type' => 'general',
                'tool' => null,
                'confidence' => $routeConfidence,
            ];
        }

        $routeTool = is_string($route['tool'] ?? null) ? trim((string) $route['tool']) : '';
        if ($routeTool === '') {
            return $intent;
        }

        return [
            'type' => $routeType,
            'tool' => $routeTool,
            'confidence' => max($confidence, $routeConfidence),
        ];
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

    private function looksLikeActionRequest(string $message): bool
    {
        $normalized = strtolower(trim($message));
        if ($normalized === '') {
            return false;
        }

        return preg_match('/\b(create|add|start|open|schedule|book|setup|set\s*up|arrange|plan|send|notify|assign|reassign|transfer|move|update|change|cancel|delete|register|save|define)\b/i', $normalized) === 1
            && preg_match('/\b(task|project|meeting|notification|alert|lead|crm|business|kpi)\b/i', $normalized) === 1;
    }

    private function resolveReadToolFromMessage(string $message): ?string
    {
        $normalized = strtolower(trim($message));
        if ($normalized === '') {
            return null;
        }

        if ($this->looksLikeActionRequest($message)) {
            return null;
        }

        if (
            preg_match('/\b(lead|leads|crm|pipeline)\b/i', $normalized) === 1
            && preg_match('/\b(list|show|get|give|provide|pull|fetch|display|retrieve|view|how many|crm|leads?)\b/i', $normalized) === 1
        ) {
            return 'crm.top_leads';
        }

        if (
            preg_match('/\b(user|users|member|members|staff|workforce|team|agents?)\b/i', $normalized) === 1
            && preg_match('/\b(list|show|get|who|under|organization|organisation|company|members?)\b/i', $normalized) === 1
        ) {
            return 'org.users';
        }

        return null;
    }

    private function resolveActionToolFromMessage(
        string $message,
        ?string $threadId,
        int $companyId,
        int $userId,
    ): ?string {
        $actionableMessage = $this->buildActionableMessage($message, $threadId, $companyId, $userId);
        $intent = $this->intentClassifier->classify($actionableMessage);
        if (($intent['type'] ?? '') === 'action' && is_string($intent['tool'] ?? null)) {
            return (string) $intent['tool'];
        }

        $normalized = strtolower(trim($actionableMessage));
        if ($normalized === '') {
            return null;
        }

        if (preg_match('/\b(task)\b/i', $normalized) && preg_match('/\b(create|add|new|open|assign|set|give)\b/i', $normalized) === 1) {
            return 'tasks.create';
        }

        if (preg_match('/\btask\b/i', $normalized) && preg_match('/\bfor\b/i', $normalized) === 1) {
            return 'tasks.create';
        }

        if (preg_match('/\bmeeting\b/i', $normalized) && preg_match('/\b(create|schedule|book|setup|set\s*up|arrange|plan|with|at|on|for|\d{1,2}\s*(?:am|pm)|reminder)\b/i', $normalized) === 1) {
            return 'meetings.schedule';
        }

        if (preg_match('/\b(task)\b/i', $normalized) && preg_match('/\b(create|add|new|open|assign)\b/i', $normalized) === 1) {
            return 'tasks.create';
        }

        if (preg_match('/\b(project)\b/i', $normalized) && preg_match('/\b(create|start|new|open)\b/i', $normalized) === 1) {
            return 'projects.create';
        }

        if (preg_match('/\b(notification|alert)\b/i', $normalized) && preg_match('/\b(send|notify|broadcast)\b/i', $normalized) === 1) {
            return 'notifications.send';
        }

        if (preg_match('/\b(lead|crm)\b/i', $normalized) && preg_match('/\b(create|add|new|register|save)\b/i', $normalized) === 1) {
            return 'crm.create_lead';
        }

        if (preg_match('/\b(email|mail|message)\b/i', $normalized) && preg_match('/\b(send|draft|write|follow[\s-]?up)\b/i', $normalized) === 1) {
            return 'crm.send_email';
        }

        if (preg_match('/\bkpi\b/i', $normalized) && preg_match('/\b(create|add|new|set|define)\b/i', $normalized) === 1) {
            return 'kpis.create';
        }

        if (
            preg_match('/\b(name|objective|target\s*value|expected\s*outcome|kpi\s*name)\s*:/i', $normalized) === 1
            && preg_match('/\bkpi\b/i', $normalized) === 1
        ) {
            return 'kpis.create';
        }

        if (preg_match('/\b(business\s+name|business\/lead\s+name|lead\s+name|phone\s+number|phone|location)\s*:/i', $normalized) === 1) {
            return 'crm.create_lead';
        }

        if (preg_match('/^\s*confirm\b/i', $normalized) === 1 || $this->isNaturalLanguageConfirmation($message)) {
            $pendingTool = $this->resolvePendingActionToolFromThread($threadId, $companyId, $userId)
                ?? $this->resolveContextualActionToolFromThread($threadId, $companyId, $userId);
            if ($pendingTool !== null) {
                return $pendingTool;
            }
        }

        return null;
    }

    private function isNaturalLanguageConfirmation(string $message): bool
    {
        $normalized = strtolower(trim($message));
        if ($normalized === '') {
            return false;
        }

        return preg_match('/^\s*(go\s+ahead|yes|yeah|yep|sure|ok|okay|proceed|do\s+it|create\s+it|please\s+create|please\s+proceed|confirm|approved?)\b/i', $normalized) === 1
            || preg_match('/\b(go\s+ahead|please\s+create|create\s+it\s+now|proceed\s+to\s+create)\b/i', $normalized) === 1;
    }

    private function resolveContextualActionToolFromThread(?string $threadId, int $companyId, int $userId): ?string
    {
        $lines = $this->collectRecentConversationLines($threadId, $companyId, $userId, 16);
        if ($lines === []) {
            return null;
        }

        $blob = strtolower(implode(' ', $lines));

        if (
            preg_match('/\b(task|assign)\b/i', $blob) === 1
            && preg_match('/\b(set|create|assign|visit|due|tomorrow|priority|description|title)\b/i', $blob) === 1
        ) {
            return 'tasks.create';
        }

        if (preg_match('/\bkpi\b/i', $blob) === 1 && preg_match('/\b(create|set|define|target|objective|assign)\b/i', $blob) === 1) {
            return 'kpis.create';
        }

        if (preg_match('/\bmeeting\b/i', $blob) === 1 && preg_match('/\b(schedule|create|book|setup|set\s*up|arrange|attendee|calendar)\b/i', $blob) === 1) {
            return 'meetings.schedule';
        }

        if (preg_match('/\b(lead|crm|business\s+name)\b/i', $blob) === 1 && preg_match('/\b(create|add|register|phone|location)\b/i', $blob) === 1) {
            return 'crm.create_lead';
        }

        return null;
    }

    private function isTaskConversationFollowUp(string $message, ?string $threadId, int $companyId, int $userId): bool
    {
        $lines = $this->collectRecentConversationLines($threadId, $companyId, $userId, 16);
        $blob = strtolower(implode(' ', [...$lines, $message]));

        if (preg_match('/\b(task|set\s+a\s+task|assign)\b/i', $blob) !== 1) {
            return false;
        }

        return preg_match('/\b(for\s+[a-z]|visit|tomorrow|priority|description|due|title|shoprite|kelvin)\b/i', $blob) === 1;
    }

    /**
     * @return array<int, string>
     */
    private function collectRecentConversationLines(?string $threadId, int $companyId, int $userId, int $limit = 12): array
    {
        if (! is_string($threadId) || trim($threadId) === '') {
            return [];
        }

        $context = $this->conversationMemoryService->buildPromptContext($companyId, $userId, $threadId);
        $recentMessages = is_array($context['recent_messages'] ?? null) ? $context['recent_messages'] : [];

        return collect($recentMessages)
            ->take(-$limit)
            ->map(static fn(array $entry): string => trim((string) ($entry['content'] ?? '')))
            ->filter(static fn(string $line): bool => $line !== '')
            ->values()
            ->all();
    }

    private function resolvePendingActionToolFromThread(?string $threadId, int $companyId, int $userId): ?string
    {
        if (! is_string($threadId) || trim($threadId) === '') {
            return null;
        }

        $thread = $this->conversationMemoryService->getThread($companyId, $userId, $threadId);
        if (! is_array($thread)) {
            return null;
        }

        $messages = is_array($thread['messages'] ?? null) ? $thread['messages'] : [];
        for ($i = count($messages) - 1; $i >= 0; $i--) {
            $msg = $messages[$i] ?? null;
            if (! is_array($msg) || (string) ($msg['role'] ?? '') !== 'assistant') {
                continue;
            }

            $payload = is_array($msg['payload'] ?? null) ? $msg['payload'] : [];
            if (($payload['confirmation_required'] ?? false) === true && is_string($payload['tool'] ?? null)) {
                return (string) $payload['tool'];
            }
        }

        return null;
    }

    private function buildActionableMessage(
        string $message,
        ?string $threadId,
        int $companyId,
        int $userId,
    ): string {
        $promptContext = $this->conversationMemoryService->buildPromptContext($companyId, $userId, $threadId);
        $recentMessages = is_array($promptContext['recent_messages'] ?? null) ? $promptContext['recent_messages'] : [];
        $userLines = collect($recentMessages)
            ->filter(static fn(array $entry): bool => (string) ($entry['role'] ?? '') === 'user')
            ->map(static fn(array $entry): string => trim((string) ($entry['content'] ?? '')))
            ->filter(static fn(string $line): bool => $line !== '')
            ->values()
            ->all();

        if ($userLines === []) {
            return trim($message);
        }

        $normalized = strtolower(trim($message));
        $isFollowUp = preg_match('/\b(setup|set\s*up|schedule|use\s+this|here\s+are|the\s+details|confirm|proceed|using\s+this|go\s+ahead|tomorrow|priority|description|medium|high|low)\b/i', $normalized) === 1
            || preg_match('/^\s*meeting\s+(is\s+)?(at|on|for)\b/i', $normalized) === 1
            || (str_contains($normalized, 'meeting') && preg_match('/\b\d{1,2}\s*(?:am|pm)\b/i', $normalized) === 1);

        $meetingContext = collect($userLines)
            ->filter(static fn(string $line): bool => preg_match('/\bmeeting\b/i', $line) === 1)
            ->implode(' ');

        $leadContext = collect($userLines)
            ->filter(static fn(string $line): bool => preg_match('/\b(lead|business\s+name|phone\s+number|location|crm)\b/i', $line) === 1)
            ->implode(' ');

        $taskContext = collect($userLines)
            ->filter(static fn(string $line): bool => preg_match('/\b(task|assign|visit|due|priority|tomorrow|title|description)\b/i', $line) === 1)
            ->implode(' ');

        $hasLeadDetails = preg_match('/\b(business\s+name|business\/lead\s+name|lead\s+name|phone\s+number|phone|location)\s*:/i', $message) === 1;
        $hasTaskIntent = preg_match('/\b(task|assign|visit|due|priority|tomorrow)\b/i', $message) === 1
            || preg_match('/\b(task|set\s+a\s+task|assign)\b/i', implode(' ', $userLines)) === 1;

        if ($hasLeadDetails) {
            $leadLines = collect($userLines)
                ->filter(static fn(string $line): bool => preg_match('/\b(lead|business\s+name|phone|location|crm)\b/i', $line) === 1 || preg_match('/\b(business\s+name|phone|location)\s*:/i', $line) === 1)
                ->push($message)
                ->unique()
                ->implode(' ');

            return trim($leadLines);
        }

        if ($hasTaskIntent) {
            $taskLines = collect($userLines)
                ->filter(static fn(string $line): bool => preg_match('/\b(task|assign|visit|due|priority|tomorrow|title|description|for\s+\w+)\b/i', $line) === 1)
                ->push($message)
                ->unique()
                ->implode(' ');

            return trim($taskLines);
        }

        if ($isFollowUp && $meetingContext !== '') {
            return trim($meetingContext . ' ' . $message);
        }

        if ($isFollowUp && $leadContext !== '') {
            return trim($leadContext . ' ' . $message);
        }

        if ($isFollowUp && $taskContext !== '') {
            return trim($taskContext . ' ' . $message);
        }

        return trim($message);
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
    ): array {
        $context = $this->conversationMemoryService->buildPromptContext($companyId, $userId, $threadId);
        $entities = is_array($context['entities'] ?? null) ? $context['entities'] : [];
        $normalized = trim($message);

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

        return match ($tool) {
            'tasks.create' => $this->inferTaskCreateArgs($message, $companyId, $entities, $role, $userId),
            'projects.create' => [
                'name' => $normalized !== '' ? $normalized : 'New Project',
                'description' => $normalized !== '' ? $normalized : 'Project created by ELY',
                'start_date' => now()->toDateString(),
            ],
            'meetings.schedule' => $this->meetingInferenceService->infer(
                message: $message,
                companyId: $companyId,
                entities: $entities,
                conversationSummary: (string) ($context['summary'] ?? ''),
                clientTimezone: $clientTimezone,
                companyCountry: $companyCountry,
            ),
            'notifications.send' => [
                'title' => 'ELY Notification',
                'message' => $normalized !== '' ? $normalized : 'New notification from ELY',
                'category' => 'system',
                'user_ids' => [$userId],
            ],
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
            ),
            'kpis.create' => $this->kpiInferenceService->infer(
                message: $message,
                companyId: $companyId,
                entities: $entities,
                conversationSummary: (string) ($context['summary'] ?? ''),
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
            return $this->normalizeProvidedActionArgsForTask($message, $companyId, $entities, $actionArgs, $role);
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
            return $this->emailInferenceService->normalizeProvidedArgs($companyId, $actionArgs);
        }

        if ($tool === 'kpis.create') {
            return $this->kpiInferenceService->normalizeProvidedArgs(
                $companyId,
                $actionArgs,
            );
        }

        return $actionArgs;
    }

    /**
     * @param array<string,string> $entities
     * @param array<string,mixed> $actionArgs
     * @return array<string,mixed>
     */
    private function normalizeProvidedActionArgsForTask(
        string $message,
        int $companyId,
        array $entities,
        array $actionArgs,
        string $role = 'admin',
    ): array {
        $normalized = $actionArgs;
        $isAgent = $role === 'agent';

        if ($isAgent) {
            unset($normalized['assigned_agent_id'], $normalized['assigned_agent_ids'], $normalized['assignee']);
        }

        if (is_string($normalized['title'] ?? null)) {
            $title = Str::limit(trim((string) $normalized['title']), 255, '');
            if ($title !== '') {
                $normalized['title'] = $title;
            }
        }

        if (is_string($normalized['description'] ?? null)) {
            $description = Str::limit(trim((string) $normalized['description']), 5000, '');
            if ($description !== '') {
                $normalized['description'] = $description;
            }
        }

        if (is_string($normalized['type'] ?? null)) {
            $typeResolution = $this->resolveTaskType((string) $normalized['type']);
            $normalized['type'] = $typeResolution['value'];
        }

        if (is_string($normalized['location'] ?? null)) {
            $location = Str::limit(trim((string) $normalized['location']), 255, '');
            if ($location !== '') {
                $normalized['location'] = $location;
            }
        }

        if (is_string($normalized['address'] ?? null)) {
            $address = Str::limit(trim((string) $normalized['address']), 1000, '');
            if ($address !== '') {
                $normalized['address'] = $address;
            }
        }

        if (is_string($normalized['due_date'] ?? null)) {
            $dueDateText = trim((string) $normalized['due_date']);
            if ($dueDateText !== '') {
                $normalized['due_date'] = $this->resolveDueDate($dueDateText);
            }
        }

        if (! $isAgent) {
            if (is_string($normalized['assignee'] ?? null)) {
                $assigneeToken = trim((string) $normalized['assignee']);
                unset($normalized['assignee']);

                if ($assigneeToken !== '') {
                    $normalized['assigned_agent_id'] = $this->resolveAgentIdFromAssigneeToken($assigneeToken, $companyId);
                }
            } elseif (is_string($normalized['assigned_agent_id'] ?? null) && is_numeric($normalized['assigned_agent_id'])) {
                $normalized['assigned_agent_id'] = (int) $normalized['assigned_agent_id'];
            }

            if (($normalized['assigned_agent_id'] ?? null) === null) {
                $fallbackAgent = $this->resolveAgentIdForTaskMessage($message, $companyId, $entities);
                if ($fallbackAgent !== null) {
                    $normalized['assigned_agent_id'] = $fallbackAgent;
                }
            }
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

    /**
     * @param array<string,string> $entities
     * @return array<string,mixed>
     */
    private function inferTaskCreateArgs(string $message, int $companyId, array $entities, string $role = 'admin', int $userId = 0): array
    {
        $normalized = trim($message);
        $isAgent = $role === 'agent';

        $rawTitle = $this->extractLabeledValue($message, ['task title', 'title'])
            ?? $this->extractTaskTitleFromSentence($message)
            ?? 'Task created by ELY';
        $title = Str::limit(trim($rawTitle), 255, '');
        $usedDefaultTitle = strtolower($title) === 'task created by ely';

        $rawDescription = $this->extractLabeledValue($message, ['description']);
        if (! is_string($rawDescription) || trim($rawDescription) === '') {
            if (preg_match('/\bgenerate\b/i', $message) === 1) {
                $rawDescription = $this->generateTaskDescription($message, $title, $companyId, $userId);
            } else {
                $rawDescription = $this->buildTaskDescriptionFallback($message, $title);
            }
        }
        $description = Str::limit(trim((string) $rawDescription), 5000, '');

        $rawType = $this->extractLabeledValue($message, ['task type', 'type']);
        if (! is_string($rawType) || trim($rawType) === '') {
            $rawType = preg_match('/\bvisit\b/i', $message) === 1 ? 'sales visit' : null;
        }
        $typeResolution = $this->resolveTaskType($rawType);
        $type = $typeResolution['value'];

        $address = $this->extractLabeledValue($message, ['location & address', 'address', 'location'])
            ?? $this->extractVisitLocationFromSentence($message)
            ?? 'Operations Center';
        $location = trim((string) Str::of($address)->before(','));
        if ($location === '') {
            $location = 'Operations Center';
        }

        $dueDateText = $this->extractLabeledValue($message, ['due date', 'due'])
            ?? $this->extractDueDateHintFromSentence($message);
        $dueAt = $this->resolveDueDate($dueDateText);
        $usedDefaultDueDate = ! is_string($dueDateText) || trim($dueDateText) === '';

        $assignedAgentId = $isAgent ? null : $this->resolveAgentIdForTaskMessage($message, $companyId, $entities);

        return [
            'title' => $title,
            'description' => $description,
            'type' => $type,
            'location' => Str::limit($location, 255, ''),
            'address' => Str::limit($address, 1000, ''),
            'due_date' => $dueAt,
            ...($isAgent ? [] : ['assigned_agent_id' => $assignedAgentId]),
            '__inference' => [
                'used_default_title' => $usedDefaultTitle,
                'used_default_due_date' => $usedDefaultDueDate,
                'raw_type_unrecognized' => $typeResolution['raw_unrecognized'],
                'assignee_unresolved' => ! $isAgent && $assignedAgentId === null,
            ],
        ];
    }

    private function generateTaskDescription(string $message, string $title, int $companyId, int $userId): string
    {
        $userPrompt = trim("Task title: {$title}\nUser request:\n{$message}");
        $result = $this->aiProviderRouter->generateForPurpose(
            purpose: 'operational',
            systemPrompt: 'Write one concise operational task description (minimum 20 characters) for a field workforce platform. Plain text only, no markdown.',
            userPrompt: $userPrompt,
            options: [
                'company_id' => $companyId,
                'max_tokens' => 160,
                'temperature' => 0.3,
                '_log' => [
                    'company_id' => $companyId,
                    'user_id' => $userId,
                    'intent_type' => 'inference',
                    'tool_name' => 'tasks.create',
                    'routing_purpose' => 'operational',
                    'user_prompt' => $userPrompt,
                ],
            ],
        );

        $candidate = $result instanceof AiGenerationResult && is_string($result->text) ? trim($result->text) : '';
        if (mb_strlen($candidate) >= 10) {
            return Str::limit($candidate, 5000, '');
        }

        return $this->buildTaskDescriptionFallback($message, $title);
    }

    private function buildTaskDescriptionFallback(string $message, string $title): string
    {
        if (preg_match('/\bvisit\s+(.+?)(?=[\.,;]|$)/i', $message, $match) === 1) {
            $target = trim((string) $match[1]);

            return "Complete the assigned visit to {$target}, document observations, engage relevant contacts, and log outcomes in the CRM.";
        }

        $fallback = trim($message) !== '' ? trim($message) : $title;

        return Str::limit($fallback, 5000, '');
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

        if ($tool === 'meetings.schedule') {
            return $this->meetingInferenceService->buildPreviewSummary($args, $warnings, $blockingConfirmation);
        }

        if ($tool === 'crm.create_lead') {
            return $this->leadInferenceService->buildPreviewSummary($args, $warnings, $blockingConfirmation);
        }

        if ($tool === 'kpis.create') {
            return $this->kpiInferenceService->buildPreviewSummary($args, $warnings, $blockingConfirmation);
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

        if ($tool !== 'tasks.create') {
            return [];
        }

        $warningCodes = [];
        $inference = is_array($args['__inference'] ?? null) ? $args['__inference'] : [];

        if ($role !== 'agent' && (($inference['assignee_unresolved'] ?? false) === true || ($args['assigned_agent_id'] ?? null) === null)) {
            $warningCodes[] = 'assignee_unresolved';
        }

        if (($inference['raw_type_unrecognized'] ?? false) === true) {
            $warningCodes[] = 'raw_type_unrecognized';
        }

        if (($inference['used_default_due_date'] ?? false) === true) {
            $warningCodes[] = 'used_default_due_date';
        }

        if (($inference['used_default_title'] ?? false) === true) {
            $warningCodes[] = 'used_default_title';
        }

        return $warningCodes;
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
        if ($idempotencyKey === null || trim($idempotencyKey) === '') {
            return $this->actionToolRegistry->execute($tool, $user, $companyId, $actionArgs);
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

        $result = $this->actionToolRegistry->execute($tool, $user, $companyId, $actionArgs);
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
    private function buildReadToolMessageArgs(string $tool, string $message): array
    {
        if ($tool === 'crm.visit_extract') {
            return ['notes' => $message];
        }

        if ($tool === 'crm.top_leads') {
            $normalized = strtolower(trim($message));
            $wantsFullList = preg_match('/\b(all|full|complete|entire)\b.{0,30}\b(leads?|list|crm)\b/i', $normalized) === 1
                || preg_match('/\b(leads?|list|crm)\b.{0,30}\b(all|full|complete|entire)\b/i', $normalized) === 1
                || preg_match('/\b(list|provide|show)\b.{0,40}\b(leads?|crm)\b/i', $normalized) === 1;

            return $wantsFullList ? ['limit' => 20] : [];
        }

        if ($tool === 'org.users') {
            return ['limit' => 50];
        }

        return [];
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

        $redacted = preg_replace('/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i', '[redacted-email]', $text);
        $redacted = preg_replace('/\+?\d[\d\s\-()]{7,}\d/', '[redacted-phone]', (string) $redacted);

        return (string) $redacted;
    }

    private function redactValue(mixed $value): mixed
    {
        if (is_string($value)) {
            return $this->redactSensitiveText($value);
        }

        if (is_array($value)) {
            $result = [];
            foreach ($value as $key => $item) {
                $result[$key] = $this->redactValue($item);
            }

            return $result;
        }

        return $value;
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
