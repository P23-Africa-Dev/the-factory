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
        'tasks.list',
        'org.users',
        'meetings.today',
        'crm.stale_leads',
        'crm.follow_up_summary',
        'tracking.active_agents',
        'projects.at_risk_summary',
        'drive.files',
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

        if ($tool === 'tasks.list') {
            $args = array_merge($args, $this->resolveTasksListArgs($message));
        }

        return $args;
    }

    /**
     * @return array<string, mixed>
     */
    private function resolveTasksListArgs(string $message): array
    {
        $args = [];

        if (preg_match('/\bcreated\s+by\s+(.+?)(?:\?|$)/i', $message, $matches) === 1) {
            $args['created_by_name'] = trim((string) $matches[1]);
        } elseif (preg_match('/\btasks?\s+created\s+by\s+(.+?)(?:\?|$)/i', $message, $matches) === 1) {
            $args['created_by_name'] = trim((string) $matches[1]);
        }

        if (preg_match('/\bassigned\s+to\s+(.+?)(?:\?|$)/i', $message, $matches) === 1) {
            $args['assignee_name'] = trim((string) $matches[1]);
        } elseif (preg_match('/\btasks?\s+(?:for|assigned\s+to)\s+(.+?)(?:\?|$)/i', $message, $matches) === 1) {
            $args['assignee_name'] = trim((string) $matches[1]);
        }

        foreach (['created_by_name', 'assignee_name'] as $key) {
            if (! isset($args[$key]) || ! is_string($args[$key])) {
                continue;
            }

            $args[$key] = trim(preg_replace('/\b(agent|user|tasks?|created|assigned)\b/i', '', $args[$key]) ?? $args[$key]);
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
        if ($this->wantsExplicitFullList($message)) {
            return $this->findLatestTruncatedListToolFromThread($threadId, $companyId, $userId);
        }

        if ($this->isAffirmativeExpansionRequest($message)) {
            // Affirmatives must bind to the latest assistant turn only — never skip past a newer confirmation.
            return $this->latestAssistantTruncatedListTool($threadId, $companyId, $userId);
        }

        return null;
    }

    /**
     * Inspect only the most recent assistant message for a truncated list offer.
     */
    public function latestAssistantTruncatedListTool(
        ?string $threadId,
        ?int $companyId,
        ?int $userId,
    ): ?string {
        $latest = $this->latestAssistantMessage($threadId, $companyId, $userId);
        if ($latest === null) {
            return null;
        }

        return $this->truncatedListToolFromMessage($latest);
    }

    public function latestAssistantTurnIsTruncatedListOffer(
        ?string $threadId,
        ?int $companyId,
        ?int $userId,
    ): bool {
        return $this->latestAssistantTruncatedListTool($threadId, $companyId, $userId) !== null;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function latestAssistantMessage(
        ?string $threadId,
        ?int $companyId,
        ?int $userId,
    ): ?array {
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

            return $msg;
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $msg
     */
    private function truncatedListToolFromMessage(array $msg): ?string
    {
        $tool = (string) ($msg['tool'] ?? '');
        if (! $this->isListTool($tool)) {
            return null;
        }

        $payload = is_array($msg['payload'] ?? null) ? $msg['payload'] : [];
        if (! $this->payloadLooksTruncated($payload)) {
            return null;
        }

        return $tool;
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function payloadLooksTruncated(array $payload): bool
    {
        return ($payload['truncated'] ?? false) === true
            || ($payload['offer_full_list'] ?? false) === true
            || (is_int($payload['remaining_count'] ?? null) && (int) $payload['remaining_count'] > 0)
            || (
                is_int($payload['total'] ?? null)
                && is_int($payload['count'] ?? null)
                && (int) $payload['total'] > (int) $payload['count']
            );
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

            $tool = $this->truncatedListToolFromMessage($msg);
            if ($tool !== null) {
                return $tool;
            }

            // Stop at the first list-tool reply that is not truncated.
            $candidateTool = (string) ($msg['tool'] ?? '');
            if ($this->isListTool($candidateTool)) {
                return null;
            }
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
        $latestTool = $this->latestAssistantTruncatedListTool($threadId, $companyId, $userId);

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
