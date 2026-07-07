<?php

declare(strict_types=1);

namespace App\Services\AI;

use App\Services\AI\Context\ConversationMemoryService;
use App\Services\AI\Support\ReadListPresenter;

class ReadToolArgsResolver
{
    /**
     * @var array<int, string>
     */
    private const LIST_TOOLS = [
        'crm.top_leads',
        'tasks.overdue',
        'org.users',
        'meetings.today',
        'crm.stale_leads',
        'crm.follow_up_summary',
        'tracking.active_agents',
        'projects.at_risk_summary',
    ];

    public function __construct(
        private readonly ReadListPresenter $readListPresenter,
        private readonly ConversationMemoryService $conversationMemoryService,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function resolve(
        string $tool,
        string $message,
        string $role,
        ?string $threadId = null,
        ?int $companyId = null,
        ?int $userId = null,
    ): array {
        if (! in_array($tool, self::LIST_TOOLS, true)) {
            return [];
        }

        $expandFullList = $this->wantsExplicitFullList($message)
            || $this->wantsThreadExpansion($message, $tool, $threadId, $companyId, $userId);

        $limit = $expandFullList
            ? $this->readListPresenter->maxExpandedLimit($tool)
            : $this->readListPresenter->previewLimit();

        $args = [
            'limit' => $limit,
            'expand_full_list' => $expandFullList,
        ];

        if ($this->isCountOnlyQuestion($message)) {
            $args['count_only'] = true;
        }

        return $args;
    }

    public function isListTool(string $tool): bool
    {
        return in_array($tool, self::LIST_TOOLS, true);
    }

    public function resolveTruncatedListToolFromThread(
        string $message,
        ?string $threadId,
        ?int $companyId,
        ?int $userId,
    ): ?string {
        if (! $this->wantsExplicitFullList($message) && ! $this->isAffirmativeExpansionRequest($message)) {
            return null;
        }

        return $this->findLatestTruncatedListToolFromThread($threadId, $companyId, $userId);
    }

    private function findLatestTruncatedListToolFromThread(
        ?string $threadId,
        ?int $companyId,
        ?int $userId,
    ): ?string {
        if (! is_string($threadId) || $threadId === '' || $companyId === null || $userId === null) {
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

            $tool = (string) ($msg['tool'] ?? '');
            if (! $this->isListTool($tool)) {
                continue;
            }

            $payload = is_array($msg['payload'] ?? null) ? $msg['payload'] : [];
            $truncated = ($payload['truncated'] ?? false) === true
                || (is_int($payload['remaining_count'] ?? null) && (int) $payload['remaining_count'] > 0)
                || (is_int($payload['total'] ?? null) && is_int($payload['count'] ?? null) && (int) $payload['total'] > (int) $payload['count']);

            if ($truncated) {
                return $tool;
            }

            return null;
        }

        return null;
    }

    private function wantsExplicitFullList(string $message): bool
    {
        $normalized = strtolower(trim($message));

        return preg_match('/\b(list|show|display|print)\s+(all|every|the\s+full|complete|entire)\b/i', $normalized) === 1
            || preg_match('/\b(all|every|full|complete|entire)\b.{0,20}\b(list|leads?|tasks?|users?|meetings?|agents?|projects?)\b/i', $normalized) === 1
            || preg_match('/\blist\s+(them\s+)?all\b/i', $normalized) === 1
            || preg_match('/\bshow\s+(me\s+)?(the\s+)?full\s+list\b/i', $normalized) === 1
            || preg_match('/\blist\s+every\s+(one|lead|task|user|meeting|agent)\b/i', $normalized) === 1;
    }

    private function wantsThreadExpansion(
        string $message,
        string $tool,
        ?string $threadId,
        ?int $companyId,
        ?int $userId,
    ): bool {
        if ($this->wantsExplicitFullList($message)) {
            return false;
        }

        if (! $this->isAffirmativeExpansionRequest($message)) {
            return false;
        }

        if (! is_string($threadId) || $threadId === '' || $companyId === null || $userId === null) {
            return false;
        }

        return $this->latestAssistantPayloadWasTruncated($threadId, $companyId, $userId, $tool);
    }

    private function isAffirmativeExpansionRequest(string $message): bool
    {
        $normalized = strtolower(trim($message));

        return preg_match('/^\s*(yes|yeah|yep|sure|ok|okay|go\s+ahead|please\s+do|do\s+it)\b/i', $normalized) === 1
            || preg_match('/\b(yes|please)\b.{0,30}\b(list|show)\b.{0,20}\b(all|them|everything|rest)\b/i', $normalized) === 1
            || preg_match('/\b(list|show)\b.{0,20}\b(all\s+of\s+them|the\s+rest|everything)\b/i', $normalized) === 1;
    }

    private function latestAssistantPayloadWasTruncated(
        string $threadId,
        int $companyId,
        int $userId,
        string $tool,
    ): bool {
        $latestTool = $this->findLatestTruncatedListToolFromThread($threadId, $companyId, $userId);

        return $latestTool === $tool;
    }

    private function isCountOnlyQuestion(string $message): bool
    {
        $normalized = strtolower(trim($message));

        if (preg_match('/\bhow\s+many\b/i', $normalized) !== 1) {
            return false;
        }

        return preg_match('/\b(list|show|display|give\s+me\s+the\s+list)\b/i', $normalized) !== 1;
    }
}
