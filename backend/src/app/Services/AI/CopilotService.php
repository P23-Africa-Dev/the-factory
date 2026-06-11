<?php

declare(strict_types=1);

namespace App\Services\AI;

use App\Models\User;
use App\Services\AI\Context\ConversationMemoryService;
use App\Services\AI\Policy\ActionConfirmationPolicyService;
use App\Services\AI\Policy\ToolPolicyService;
use App\Services\AI\Providers\AiProviderRouter;
use App\Services\AI\Tools\ActionToolRegistry;
use App\Services\AI\Tools\ReadToolRegistry;
use App\Services\Company\CompanyContextService;
use Illuminate\Support\Facades\Cache;
use App\Services\AI\AiLoggingService;
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
    ) {}

    public function chat(
        User $user,
        string $message,
        ?int $companyId = null,
        ?string $threadId = null,
        array $actionArgs = [],
        bool $actionConfirmed = false,
        ?string $idempotencyKey = null,
    ): array {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $role = (string) $context['role'];

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
        if (($intent['type'] ?? 'general') === 'general' && $this->looksLikeActionRequest($message)) {
            $intent = [
                'type' => 'action',
                'tool' => null,
                'confidence' => 0.5,
                'note' => 'action_like_request_without_resolved_tool',
            ];
        }

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
                $assistantText = 'Copilot write actions are currently disabled by configuration. Read-only answers are still available.';
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
                        $inferredArgs = $this->inferActionArgs($message, $candidateTool, $resolvedCompanyId, $actionArgs, $threadId, (int) $user->id);
                        $toolResult = [
                            'summary' => 'This action requires explicit confirmation. Re-submit the request with action_confirmed=true to proceed.',
                            'sources' => [$candidateTool],
                            'payload' => [
                                'confirmation_required' => true,
                                'tool' => $candidateTool,
                                'action_args' => $inferredArgs,
                                'execution_model' => (string) config('services.ai.exec_model', config('services.ai.default_model')),
                            ],
                        ];
                    } else {
                        $resolvedActionArgs = $this->inferActionArgs($message, $candidateTool, $resolvedCompanyId, $actionArgs, $threadId, (int) $user->id);
                        $toolResult = $this->executeActionWithIdempotency(
                            user: $user,
                            companyId: $resolvedCompanyId,
                            tool: $candidateTool,
                            actionArgs: $resolvedActionArgs,
                            idempotencyKey: $idempotencyKey,
                        );
                    }
                } else {
                    $toolResult = $this->readToolRegistry->execute($candidateTool, $user, $resolvedCompanyId);
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

        if ($this->looksLikeActionRequest($message)) {
            return 'This looks like a write action request. Please specify the exact action and required details so I can execute it instead of only describing it.';
        }

        if ((str_contains($normalized, 'same agent') || str_contains($normalized, 'that agent')) && is_string($contextEntities['agent'] ?? null)) {
            $message .= ' (same agent refers to: ' . $contextEntities['agent'] . ')';
        }

        if (str_contains($normalized, 'my name') || str_contains($normalized, "what's my name") || str_contains($normalized, 'what is my name')) {
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
            return 'Factory23 is your operations workspace. Ask for CRM summaries, overdue tasks, project risk status, attendance snapshots, meetings, and role-scoped live tracking insights.';
        }

        $systemPrompt = 'You are Ask The Factory, an operations copilot. Respond concisely, avoid policy bypass, and stay within role-scoped company context. Always refer to the organization by the provided company name, and do not invent code names or numeric company labels.';
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

        $providerText = $this->aiProviderRouter->generateText(
            systemPrompt: $systemPrompt,
            userPrompt: $userPrompt,
            options: [
                'model' => (string) config('services.ai.exec_model', config('services.ai.default_model', 'gpt-4.1-mini')),
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

        return preg_match('/\b(create|add|start|open|schedule|book|send|notify|assign|reassign|transfer|move|update|change|cancel|delete)\b/i', $normalized) === 1
            && preg_match('/\b(task|project|meeting|notification|alert)\b/i', $normalized) === 1;
    }

    private function inferActionArgs(
        string $message,
        string $tool,
        int $companyId,
        array $actionArgs,
        ?string $threadId,
        int $userId,
    ): array {
        if ($actionArgs !== []) {
            return $actionArgs;
        }

        $context = $this->conversationMemoryService->buildPromptContext($companyId, $userId, $threadId);
        $entities = is_array($context['entities'] ?? null) ? $context['entities'] : [];
        $normalized = trim($message);

        return match ($tool) {
            'tasks.create' => [
                'title' => $normalized !== '' ? $normalized : 'Task created by Copilot',
                'description' => $normalized !== '' ? $normalized : 'Task generated from chat request',
                'type' => 'inspection',
                'location' => 'Operations Center',
                'address' => 'Factory23 Operations Center',
                'due_date' => now()->addDay()->toDateString(),
                'assigned_agent_id' => $this->resolveAgentIdFromMessage($message, $companyId, $entities),
            ],
            'projects.create' => [
                'name' => $normalized !== '' ? $normalized : 'New Project',
                'description' => $normalized !== '' ? $normalized : 'Project created by Copilot',
                'start_date' => now()->toDateString(),
            ],
            'meetings.schedule' => [
                'title' => $normalized !== '' ? $normalized : 'Operations Meeting',
                'description' => $normalized,
                'timezone' => config('app.timezone', 'UTC'),
                'start_at' => now()->addDay()->setTime(10, 0)->toDateTimeString(),
                'end_at' => now()->addDay()->setTime(11, 0)->toDateTimeString(),
                'location' => 'Main Conference Room',
            ],
            'notifications.send' => [
                'title' => 'Copilot Notification',
                'message' => $normalized !== '' ? $normalized : 'New notification from Copilot',
                'category' => 'system',
                'user_ids' => [$userId],
            ],
            default => $actionArgs,
        };
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
