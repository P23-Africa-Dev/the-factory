<?php

declare(strict_types=1);

namespace App\Services\AI;

use App\Models\User;
use App\Services\AI\Context\ConversationMemoryService;
use App\Services\AI\Policy\ActionConfirmationPolicyService;
use App\Services\AI\Policy\ToolPolicyService;
use App\Services\AI\Tools\ActionToolRegistry;
use App\Services\AI\Tools\ReadToolRegistry;
use App\Services\Company\CompanyContextService;
use Illuminate\Support\Facades\Cache;

class CopilotService
{
    public function __construct(
        private readonly CompanyContextService $companyContextService,
        private readonly IntentClassifier $intentClassifier,
        private readonly ToolPolicyService $toolPolicyService,
        private readonly ActionConfirmationPolicyService $actionConfirmationPolicyService,
        private readonly ReadToolRegistry $readToolRegistry,
        private readonly ActionToolRegistry $actionToolRegistry,
        private readonly ConversationMemoryService $conversationMemoryService,
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

        $intent = $this->intentClassifier->classify($message);

        $assistantText = 'I can help with leads, tasks, projects, meetings, attendance, tracking, and dashboard summaries. Try asking for a concrete operational report.';
        $toolResult = null;
        $resolvedTool = null;

        $intentType = (string) ($intent['type'] ?? 'general');

        if (($intentType === 'tool' || $intentType === 'action') && is_string($intent['tool'] ?? null)) {
            $candidateTool = (string) $intent['tool'];

            if ($this->toolPolicyService->canUseTool($role, $candidateTool)) {
                if ($intentType === 'action') {
                    if ($this->actionConfirmationPolicyService->requiresConfirmation($candidateTool) && ! $actionConfirmed) {
                        $toolResult = [
                            'summary' => 'This action requires explicit confirmation. Re-submit the request with action_confirmed=true to proceed.',
                            'sources' => [$candidateTool],
                            'payload' => [
                                'confirmation_required' => true,
                                'tool' => $candidateTool,
                                'action_args' => $actionArgs,
                            ],
                        ];
                    } else {
                        $toolResult = $this->executeActionWithIdempotency(
                            user: $user,
                            companyId: $resolvedCompanyId,
                            tool: $candidateTool,
                            actionArgs: $actionArgs,
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
        }

        $thread = $this->conversationMemoryService->appendMessage(
            companyId: $resolvedCompanyId,
            userId: (int) $user->id,
            threadId: $threadId,
            role: 'user',
            content: $message,
            payload: [
                'intent' => $intent,
            ],
        );

        $threadId = (string) $thread['thread_id'];

        $this->conversationMemoryService->appendMessage(
            companyId: $resolvedCompanyId,
            userId: (int) $user->id,
            threadId: $threadId,
            role: 'assistant',
            content: $assistantText,
            sources: $toolResult['sources'] ?? [],
            tool: $resolvedTool,
            payload: $toolResult['payload'] ?? null,
        );

        return [
            'thread_id' => $threadId,
            'role' => $role,
            'company_id' => $resolvedCompanyId,
            'intent' => $intent,
            'response' => [
                'content' => $assistantText,
                'tool' => $resolvedTool,
                'sources' => $toolResult['sources'] ?? [],
                'payload' => $toolResult['payload'] ?? null,
            ],
        ];
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
}
