<?php

declare(strict_types=1);

namespace App\Services\AI;

use App\Enums\TaskType;
use App\Models\User;
use App\Services\AI\Context\ConversationMemoryService;
use App\Services\AI\Policy\ActionConfirmationPolicyService;
use App\Services\AI\Policy\ToolPolicyService;
use App\Services\AI\Providers\AiProviderRouter;
use App\Services\AI\Tools\ActionToolRegistry;
use App\Services\AI\Tools\ReadToolRegistry;
use App\Services\Company\CompanyContextService;
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
        array $context = [],
    ): array {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $role = (string) $context['role'];
        $companyCountry = (string) ($context['company']->country ?? '');

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

        $actionMessage = $this->buildActionableMessage($message, $threadId, $resolvedCompanyId, (int) $user->id);

        $intentType = (string) ($intent['type'] ?? 'general');

        $assistantText = 'I can help with leads, tasks, projects, meetings, attendance, tracking, and dashboard summaries. Ask things like "How many leads are in my CRM?" or "Show overdue tasks."';
        $toolResult = null;
        $resolvedTool = null;

        if (($intentType === 'tool' || $intentType === 'action') && is_string($intent['tool'] ?? null)) {
            $candidateTool = (string) $intent['tool'];
            $aiLog = $this->aiLoggingService->begin(
                companyId: $resolvedCompanyId,
                userId: (int) $user->id,
                sessionId: $threadId,
                provider: (string) config('services.ai.provider', 'openai'),
                model: (string) config('services.ai.exec_model', config('services.ai.default_model', 'gpt-4.1-mini')),
                userPrompt: $message,
                sanitizedPrompt: $this->redactSensitiveText($message),
                intentType: $intentType,
                toolName: $candidateTool,
            );

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
                            $clientTimezone,
                            $companyCountry,
                        );
                        $validationWarningCodes = $this->inferActionWarningCodes($candidateTool, $inferredArgs);
                        $validationWarnings = $this->inferActionWarnings($candidateTool, $inferredArgs);
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
                                'execution_model' => (string) config('services.ai.exec_model', config('services.ai.default_model')),
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

                            $this->aiLoggingService->fail(
                                $aiLog,
                                'action_validation_failed',
                                $e->getMessage(),
                                $e,
                            );
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

                            $this->aiLoggingService->fail(
                                $aiLog,
                                'action_execution_failed',
                                $e->getMessage(),
                                $e,
                            );
                        }
                    }
                } else {
                    $toolResult = $this->readToolRegistry->execute(
                        $candidateTool,
                        $user,
                        $resolvedCompanyId,
                        array_merge(
                            $this->buildReadToolArgs($candidateTool, $context),
                            $this->buildReadToolMessageArgs($candidateTool, $message),
                        ),
                    );
                }

                $assistantText = (string) ($toolResult['summary'] ?? $assistantText);
                $resolvedTool = $candidateTool;
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
            $aiLog = $this->aiLoggingService->begin(
                companyId: $resolvedCompanyId,
                userId: (int) $user->id,
                sessionId: $threadId,
                provider: (string) config('services.ai.provider', 'openai'),
                model: (string) config('services.ai.exec_model', config('services.ai.default_model', 'gpt-4.1-mini')),
                userPrompt: $message,
                sanitizedPrompt: $this->redactSensitiveText($message),
                intentType: 'general',
                toolName: null,
            );
            $startMs = microtime(true);
            $assistantText = $this->resolveGeneralResponse(
                user: $user,
                role: $role,
                companyId: $resolvedCompanyId,
                companyName: (string) ($context['company']->name ?? 'your active organization'),
                userId: (int) $user->id,
                threadId: $threadId,
                message: $message,
            );
            $execMs = (int) round((microtime(true) - $startMs) * 1000);
            // Approximate token estimate: 1 token ≈ 4 chars
            $inputEst = (int) ceil(mb_strlen($message) / 4);
            $outputEst = (int) ceil(mb_strlen($assistantText) / 4);
            $this->aiLoggingService->complete($aiLog, $inputEst, $outputEst);
        }

        // Complete AI log for tool/action paths (general path completes its own log inline above)
        if (isset($aiLog) && $aiLog instanceof \App\Models\AiLog && $aiLog->status === 'success' && $aiLog->ended_at === null) {
            $inputEst = (int) ceil(mb_strlen($message) / 4);
            $outputEst = (int) ceil(mb_strlen($assistantText) / 4);
            $this->aiLoggingService->complete($aiLog, $inputEst, $outputEst);
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
            creditsConsumed: 1,
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

    private function resolveGeneralResponse(
        User $user,
        string $role,
        int $companyId,
        string $companyName,
        int $userId,
        ?string $threadId,
        string $message,
    ): string {
        $normalized = strtolower(trim($message));
        $resolvedCompanyName = trim($companyName) !== '' ? $companyName : 'your active organization';
        $promptContext = $this->conversationMemoryService->buildPromptContext($companyId, $userId, $threadId);
        $contextEntities = is_array($promptContext['entities'] ?? null) ? $promptContext['entities'] : [];

        if ($this->looksLikeActionRequest($message) && $this->resolveActionToolFromMessage($message, $threadId, $companyId, $userId) === null) {
            return 'I can help schedule that. Try phrasing it like "Create a meeting with [name] tomorrow at 2 PM" so I can prepare the confirmation form for you.';
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
            return "Your name is {$user->name}.";
        }

        if (
            str_contains($normalized, 'my account')
            || str_contains($normalized, 'my role')
            || str_contains($normalized, 'about my account')
        ) {
            return sprintf(
                'You are signed in as %s in %s. I can help you with CRM, tasks, projects, meetings, attendance, tracking, and dashboard operations.',
                $role,
                $resolvedCompanyName,
            );
        }

        if (str_contains($normalized, 'this software') || str_contains($normalized, 'what is factory23') || str_contains($normalized, 'what does this do')) {
            return ElySystemPrompt::intro() . ' Factory23 is your operations workspace. Ask for CRM summaries, overdue tasks, project risk status, attendance snapshots, meetings, and role-scoped live tracking insights.';
        }

        $systemPrompt = ElySystemPrompt::core();
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

        $providerText = $this->aiProviderRouter->generateForPurpose(
            purpose: 'operational',
            systemPrompt: $systemPrompt,
            userPrompt: $userPrompt,
            options: [
                'max_tokens' => max(64, (int) config('services.ai.max_tokens', 4000)),
                'temperature' => 0.2,
            ],
        );

        if (is_string($providerText) && trim($providerText) !== '') {
            return trim($providerText);
        }

        return 'I can help with leads, tasks, projects, meetings, attendance, tracking, and dashboard summaries. Ask things like "How many leads are in my CRM?" or "Show overdue tasks."';
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

        return preg_match('/\b(create|add|start|open|schedule|book|setup|set\s*up|arrange|plan|send|notify|assign|reassign|transfer|move|update|change|cancel|delete)\b/i', $normalized) === 1
            && preg_match('/\b(task|project|meeting|notification|alert)\b/i', $normalized) === 1;
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
        $isFollowUp = preg_match('/\b(setup|set\s*up|schedule|use\s+this|here\s+are|the\s+details|confirm|proceed|using\s+this)\b/i', $normalized) === 1
            || preg_match('/^\s*meeting\s+(is\s+)?(at|on|for)\b/i', $normalized) === 1
            || (str_contains($normalized, 'meeting') && preg_match('/\b\d{1,2}\s*(?:am|pm)\b/i', $normalized) === 1);

        $meetingContext = collect($userLines)
            ->filter(static fn(string $line): bool => preg_match('/\bmeeting\b/i', $line) === 1)
            ->implode(' ');

        if ($isFollowUp && $meetingContext !== '') {
            return trim($meetingContext . ' ' . $message);
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
            );
        }

        return match ($tool) {
            'tasks.create' => $this->inferTaskCreateArgs($message, $companyId, $entities),
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
    ): array {
        if ($tool === 'tasks.create') {
            return $this->normalizeProvidedActionArgsForTask($message, $companyId, $entities, $actionArgs);
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
    ): array {
        $normalized = $actionArgs;

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
    private function inferTaskCreateArgs(string $message, int $companyId, array $entities): array
    {
        $normalized = trim($message);

        $rawTitle = $this->extractLabeledValue($message, ['task title', 'title'])
            ?? $this->extractTaskTitleFromSentence($message)
            ?? 'Task created by ELY';
        $title = Str::limit(trim($rawTitle), 255, '');
        $usedDefaultTitle = strtolower($title) === 'task created by ely';

        $rawDescription = $this->extractLabeledValue($message, ['description'])
            ?? $normalized
            ?? 'Task generated from chat request';
        $description = Str::limit(trim($rawDescription), 5000, '');

        $rawType = $this->extractLabeledValue($message, ['task type', 'type']);
        $typeResolution = $this->resolveTaskType($rawType);
        $type = $typeResolution['value'];

        $address = $this->extractLabeledValue($message, ['location & address', 'address', 'location'])
            ?? 'Factory23 Operations Center';
        $location = trim((string) Str::of($address)->before(','));
        if ($location === '') {
            $location = 'Operations Center';
        }

        $dueDateText = $this->extractLabeledValue($message, ['due date', 'due'])
            ?? $this->extractDueDateHintFromSentence($message);
        $dueAt = $this->resolveDueDate($dueDateText);
        $usedDefaultDueDate = ! is_string($dueDateText) || trim($dueDateText) === '';

        $assignedAgentId = $this->resolveAgentIdForTaskMessage($message, $companyId, $entities);

        return [
            'title' => $title,
            'description' => $description,
            'type' => $type,
            'location' => Str::limit($location, 255, ''),
            'address' => Str::limit($address, 1000, ''),
            'due_date' => $dueAt,
            'assigned_agent_id' => $assignedAgentId,
            '__inference' => [
                'used_default_title' => $usedDefaultTitle,
                'used_default_due_date' => $usedDefaultDueDate,
                'raw_type_unrecognized' => $typeResolution['raw_unrecognized'],
                'assignee_unresolved' => $assignedAgentId === null,
            ],
        ];
    }

    private function extractTaskTitleFromSentence(string $message): ?string
    {
        if (preg_match('/\b(?:task\s+title|title)\b\s*[:\-]?\s*["“](.+?)["”]/i', $message, $m) === 1) {
            return trim((string) $m[1]);
        }

        if (preg_match('/\btask\s+title\s*:\s*([^\.\n]+)/i', $message, $m) === 1) {
            return trim((string) $m[1]);
        }

        if (preg_match('/\bcreate\s+(a\s+)?task\b[:\-\s]*(.+?)(?=\.|\n|task\s+type\s*:|description\s*:|assign\s*to\s*:|due\s+date\s*:|$)/i', $message, $m) === 1) {
            $candidate = trim((string) $m[2]);
            return $candidate !== '' ? $candidate : null;
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
                $value = trim((string) $m[1]);
                if ($value !== '') {
                    return $value;
                }
            }
        }

        return null;
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
            $candidate = trim((string) $m[1]);
            $candidate = preg_replace('/\((.*?)\)/', '', $candidate) ?: $candidate;
            $candidate = preg_replace('/\bagent\s+/i', '', $candidate) ?: $candidate;
            $candidate = trim($candidate);

            if ($candidate !== '') {
                $byName = $this->resolveAgentIdFromAssigneeToken($candidate, $companyId);
                if ($byName !== null) {
                    return $byName;
                }
            }
        }

        if (preg_match('/\bassign\s+to\s+([^\.\n,;]+)/i', $message, $m) === 1) {
            $candidate = trim((string) $m[1]);
            $candidate = preg_replace('/\((.*?)\)/', '', $candidate) ?: $candidate;
            $candidate = preg_replace('/\bagent\s+/i', '', $candidate) ?: $candidate;
            $candidate = trim($candidate);

            if ($candidate !== '') {
                $byName = $this->resolveAgentIdFromAssigneeToken($candidate, $companyId);
                if ($byName !== null) {
                    return $byName;
                }
            }
        }

        return $this->resolveAgentIdFromMessage($message, $companyId, $entities);
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

        return 'ELY prepared an action. Review and click Confirm Action to proceed.';
    }

    /**
     * @param array<string,mixed> $args
     * @return array<int,string>
     */
    private function inferActionWarnings(string $tool, array $args): array
    {
        $codes = $this->inferActionWarningCodes($tool, $args);
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
    private function inferActionWarningCodes(string $tool, array $args): array
    {
        if ($tool === 'meetings.schedule') {
            return $this->meetingInferenceService->warningCodes($args);
        }

        if ($tool !== 'tasks.create') {
            return [];
        }

        $warningCodes = [];
        $inference = is_array($args['__inference'] ?? null) ? $args['__inference'] : [];

        if (($inference['assignee_unresolved'] ?? false) === true || ($args['assigned_agent_id'] ?? null) === null) {
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
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    private function buildReadToolArgs(string $tool, array $context): array
    {
        if ($tool !== 'planning.daily') {
            return [];
        }

        $args = [];
        if (isset($context['latitude']) && is_numeric($context['latitude'])) {
            $args['latitude'] = (float) $context['latitude'];
        }
        if (isset($context['longitude']) && is_numeric($context['longitude'])) {
            $args['longitude'] = (float) $context['longitude'];
        }
        if (isset($context['focus']) && is_string($context['focus'])) {
            $args['focus'] = $context['focus'];
        }
        if (isset($context['limit']) && is_numeric($context['limit'])) {
            $args['limit'] = (int) $context['limit'];
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

        return [];
    }

    private function canConsumeCredits(int $companyId): bool
    {
        $limit = (int) config('services.ai.monthly_org_credit_limit', 0);
        if ($limit <= 0) {
            return true;
        }

        return ((int) Cache::get($this->monthlyCreditKey($companyId), 0)) < $limit;
    }

    private function registerCreditUsage(int $companyId, int $credits): void
    {
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
}
