<?php

declare(strict_types=1);

namespace App\Services\AI\Context;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class ConversationMemoryService
{
    private const THREAD_TTL_SECONDS = 604800;

    /**
     * @return array{summary:string,recent_messages:array<int,array{role:string,content:string}>,entities:array<string,string>}
     */
    public function buildPromptContext(int $companyId, int $userId, ?string $threadId, int $recentLimit = 8): array
    {
        if (! is_string($threadId) || trim($threadId) === '') {
            return [
                'summary' => '',
                'recent_messages' => [],
                'entities' => [],
            ];
        }

        $thread = $this->getThread($companyId, $userId, $threadId);
        if (! is_array($thread)) {
            return [
                'summary' => '',
                'recent_messages' => [],
                'entities' => [],
            ];
        }

        $messages = collect(is_array($thread['messages'] ?? null) ? $thread['messages'] : [])
            ->filter(static fn(mixed $msg): bool => is_array($msg))
            ->values();

        if ($messages->isEmpty()) {
            return [
                'summary' => '',
                'recent_messages' => [],
                'entities' => [],
            ];
        }

        $recent = $messages
            ->take(-1 * max(1, $recentLimit))
            ->map(static fn(array $msg): array => [
                'role' => (string) ($msg['role'] ?? 'assistant'),
                'content' => Str::limit(trim((string) ($msg['content'] ?? '')), 320),
            ])
            ->filter(static fn(array $msg): bool => $msg['content'] !== '')
            ->values()
            ->all();

        $older = $messages->slice(0, max(0, $messages->count() - max(1, $recentLimit)))->values();
        $summary = $this->summaryForOlderMessages($companyId, $userId, $threadId, $older->all());
        $entities = $this->extractEntities($messages->all());

        return [
            'summary' => $summary,
            'recent_messages' => $recent,
            'entities' => $entities,
        ];
    }

    public function appendMessage(
        int $companyId,
        int $userId,
        ?string $threadId,
        string $role,
        string $content,
        ?array $sources = null,
        ?string $tool = null,
        mixed $payload = null,
    ): array {
        $resolvedThreadId = $threadId ?: (string) Str::uuid();
        $thread = $this->getThread($companyId, $userId, $resolvedThreadId);

        if ($thread === null) {
            $now = now()->toIso8601String();
            $thread = [
                'thread_id' => $resolvedThreadId,
                'company_id' => $companyId,
                'user_id' => $userId,
                'created_at' => $now,
                'updated_at' => $now,
                'messages' => [],
            ];
        }

        $thread['messages'][] = [
            'id' => (string) Str::uuid(),
            'role' => $role,
            'content' => $content,
            'sources' => $sources ?? [],
            'tool' => $tool,
            'payload' => $payload,
            'created_at' => now()->toIso8601String(),
        ];

        $thread['updated_at'] = now()->toIso8601String();

        $this->storeThread($companyId, $userId, $resolvedThreadId, $thread);

        return $thread;
    }

    public function getThread(int $companyId, int $userId, string $threadId): ?array
    {
        $thread = Cache::get($this->threadKey($companyId, $userId, $threadId));

        return is_array($thread) ? $thread : null;
    }

    public function hasThread(int $companyId, int $userId, string $threadId): bool
    {
        return Cache::has($this->threadKey($companyId, $userId, $threadId));
    }

    public function getThreadMessages(int $companyId, int $userId, string $threadId, int $limit = 20, ?string $cursor = null): ?array
    {
        $thread = $this->getThread($companyId, $userId, $threadId);
        if (! is_array($thread)) {
            return null;
        }

        $messages = is_array($thread['messages'] ?? []) ? $thread['messages'] : [];
        $totalCount = count($messages);

        if ($totalCount === 0) {
            return [
                'thread_id' => (string) $thread['thread_id'],
                'created_at' => (string) ($thread['created_at'] ?? ''),
                'updated_at' => (string) ($thread['updated_at'] ?? ''),
                'message_count' => 0,
                'messages' => [],
                'pagination' => [
                    'has_more' => false,
                    'next_cursor' => null,
                    'loaded_count' => 0,
                ],
            ];
        }

        $cursorPosition = null;
        if (is_string($cursor) && trim($cursor) !== '') {
            foreach ($messages as $index => $message) {
                if (is_array($message) && isset($message['id']) && $message['id'] === $cursor) {
                    $cursorPosition = $index;
                    break;
                }
            }

            if ($cursorPosition === null) {
                return null;
            }
        }

        $end = $cursorPosition ?? $totalCount;
        $start = max(0, $end - $limit);
        $pageMessages = array_slice($messages, $start, $end - $start);
        $hasMore = $start > 0;
        $nextCursor = $hasMore && count($pageMessages) > 0 ? (string) ($pageMessages[0]['id'] ?? '') : null;

        return [
            'thread_id' => (string) $thread['thread_id'],
            'created_at' => (string) ($thread['created_at'] ?? ''),
            'updated_at' => (string) ($thread['updated_at'] ?? ''),
            'message_count' => $totalCount,
            'messages' => $pageMessages,
            'pagination' => [
                'has_more' => $hasMore,
                'next_cursor' => $nextCursor,
                'loaded_count' => count($pageMessages),
            ],
        ];
    }

    /**
     * @return array<int,array<string,mixed>>
     */
    public function listThreads(int $companyId, int $userId): array
    {
        $threadIds = $this->threadIds($companyId, $userId);

        return collect($threadIds)
            ->map(fn(string $id): ?array => $this->getThread($companyId, $userId, $id))
            ->filter()
            ->sortByDesc(static fn(array $thread): string => (string) ($thread['updated_at'] ?? ''))
            ->values()
            ->map(static function (array $thread): array {
                $messages = is_array($thread['messages'] ?? null) ? $thread['messages'] : [];
                $lastMessage = count($messages) > 0 ? $messages[array_key_last($messages)] : null;

                return [
                    'thread_id' => (string) $thread['thread_id'],
                    'updated_at' => (string) ($thread['updated_at'] ?? ''),
                    'created_at' => (string) ($thread['created_at'] ?? ''),
                    'message_count' => count($messages),
                    'last_message_preview' => is_array($lastMessage)
                        ? Str::limit((string) ($lastMessage['content'] ?? ''), 140)
                        : null,
                ];
            })
            ->all();
    }

    /**
     * @return array{
     *   items: array<int, array<string, mixed>>,
     *   pagination: array{has_more: bool, next_cursor: string|null, scanned_threads: int}
     * }
     */
    public function searchThreads(
        int $companyId,
        int $userId,
        string $query,
        int $limit = 15,
        ?string $cursor = null,
    ): array {
        $needle = strtolower(trim($query));
        if ($needle === '') {
            return [
                'items' => [],
                'pagination' => [
                    'has_more' => false,
                    'next_cursor' => null,
                    'scanned_threads' => 0,
                ],
            ];
        }

        $boundedLimit = max(1, min(30, $limit));
        $index = Cache::get($this->indexKey($companyId, $userId), []);
        if (! is_array($index)) {
            return [
                'items' => [],
                'pagination' => [
                    'has_more' => false,
                    'next_cursor' => null,
                    'scanned_threads' => 0,
                ],
            ];
        }

        $orderedThreadIds = collect($index)
            ->filter(static fn(mixed $updatedAt, mixed $threadId): bool => is_string($threadId) && $threadId !== '')
            ->sortByDesc(static fn(mixed $updatedAt): string => is_string($updatedAt) ? $updatedAt : '')
            ->keys()
            ->values()
            ->all();

        $startIndex = 0;
        if (is_string($cursor) && $cursor !== '') {
            $cursorPos = array_search($cursor, $orderedThreadIds, true);
            if ($cursorPos === false) {
                return [
                    'items' => [],
                    'pagination' => [
                        'has_more' => false,
                        'next_cursor' => null,
                        'scanned_threads' => 0,
                    ],
                ];
            }

            $startIndex = (int) $cursorPos + 1;
        }

        $items = [];
        $scanned = 0;
        $lastScannedId = null;

        for ($i = $startIndex; $i < count($orderedThreadIds); $i++) {
            $threadId = (string) $orderedThreadIds[$i];
            $lastScannedId = $threadId;
            $scanned++;

            $thread = $this->getThread($companyId, $userId, $threadId);
            if (! is_array($thread)) {
                continue;
            }

            $messages = is_array($thread['messages'] ?? null) ? $thread['messages'] : [];
            $title = $this->threadTitle($messages);
            $match = $this->firstMessageMatch($messages, $needle);

            if ($match === null && ! str_contains(strtolower($title), $needle)) {
                continue;
            }

            if ($match === null) {
                $match = [
                    'message_id' => '',
                    'role' => 'assistant',
                    'snippet' => Str::limit($title, 180),
                ];
            }

            $items[] = [
                'thread_id' => (string) $thread['thread_id'],
                'title' => $title,
                'updated_at' => (string) ($thread['updated_at'] ?? ''),
                'snippet' => (string) $match['snippet'],
                'match_message_id' => (string) $match['message_id'],
                'match_role' => (string) $match['role'],
                'message_count' => count($messages),
            ];

            if (count($items) >= $boundedLimit) {
                break;
            }
        }

        $hasMore = false;
        $nextCursor = null;
        if ($lastScannedId !== null) {
            $lastIndex = array_search($lastScannedId, $orderedThreadIds, true);
            if (is_int($lastIndex) && $lastIndex < count($orderedThreadIds) - 1) {
                $hasMore = true;
                $nextCursor = $lastScannedId;
            }
        }

        return [
            'items' => $items,
            'pagination' => [
                'has_more' => $hasMore,
                'next_cursor' => $nextCursor,
                'scanned_threads' => $scanned,
            ],
        ];
    }

    public function deleteThread(int $companyId, int $userId, string $threadId): bool
    {
        $indexKey = $this->indexKey($companyId, $userId);
        $index = Cache::get($indexKey, []);
        $exists = Cache::has($this->threadKey($companyId, $userId, $threadId));

        if (is_array($index) && array_key_exists($threadId, $index)) {
            unset($index[$threadId]);
            Cache::put($indexKey, $index, self::THREAD_TTL_SECONDS);
        }

        Cache::forget($this->threadKey($companyId, $userId, $threadId));

        return $exists;
    }

    private function storeThread(int $companyId, int $userId, string $threadId, array $thread): void
    {
        Cache::put($this->threadKey($companyId, $userId, $threadId), $thread, self::THREAD_TTL_SECONDS);

        $indexKey = $this->indexKey($companyId, $userId);
        $index = Cache::get($indexKey, []);
        if (! is_array($index)) {
            $index = [];
        }

        $index[$threadId] = (string) ($thread['updated_at'] ?? now()->toIso8601String());
        Cache::put($indexKey, $index, self::THREAD_TTL_SECONDS);
    }

    /**
     * @return array<int,string>
     */
    private function threadIds(int $companyId, int $userId): array
    {
        $index = Cache::get($this->indexKey($companyId, $userId), []);
        if (! is_array($index)) {
            return [];
        }

        return collect(array_keys($index))
            ->filter(static fn(mixed $id): bool => is_string($id) && $id !== '')
            ->values()
            ->all();
    }

    private function threadKey(int $companyId, int $userId, string $threadId): string
    {
        return "copilot:thread:{$companyId}:{$userId}:{$threadId}";
    }

    /**
     * @param array<int,array<string,mixed>> $olderMessages
     */
    private function summaryForOlderMessages(int $companyId, int $userId, string $threadId, array $olderMessages): string
    {
        if ($olderMessages === []) {
            return '';
        }

        $cacheKey = "copilot:summary:{$companyId}:{$userId}:{$threadId}";
        $fingerprint = sha1(json_encode($olderMessages) ?: '');
        $cached = Cache::get($cacheKey);

        if (is_array($cached) && ($cached['fingerprint'] ?? null) === $fingerprint && is_string($cached['summary'] ?? null)) {
            return (string) $cached['summary'];
        }

        $summaryLines = collect($olderMessages)
            ->map(static fn(array $msg): string => sprintf(
                '[%s] %s',
                (string) ($msg['role'] ?? 'assistant'),
                Str::limit(trim((string) ($msg['content'] ?? '')), 180)
            ))
            ->filter(static fn(string $line): bool => $line !== '')
            ->take(-10)
            ->values()
            ->all();

        $summary = implode("\n", $summaryLines);

        Cache::put($cacheKey, [
            'fingerprint' => $fingerprint,
            'summary' => $summary,
        ], self::THREAD_TTL_SECONDS);

        return $summary;
    }

    /**
     * @param array<int,array<string,mixed>> $messages
     * @return array<string,string>
     */
    private function extractEntities(array $messages): array
    {
        $entities = [];

        foreach ($messages as $msg) {
            $content = trim((string) ($msg['content'] ?? ''));
            if ($content === '') {
                continue;
            }

            if (preg_match('/\bagent\s+([a-z][a-z\-]*(?:\s+[a-z][a-z\-]*){0,3})(?=\s+(?:to|for|on|at|by|with)\b|[\.,!?]|$)/i', $content, $m) === 1) {
                $entities['agent'] = trim((string) $m[1]);
            }

            if (preg_match('/\bproject\s+([a-z0-9][a-z0-9\s\-]{1,60})/i', $content, $m) === 1) {
                $entities['project'] = trim((string) $m[1]);
            }

            if (preg_match('/\btask\s+([a-z0-9][a-z0-9\s\-]{1,60})/i', $content, $m) === 1) {
                $entities['task'] = trim((string) $m[1]);
            }

            if (preg_match('/\breport\s+for\s+([a-z0-9][a-z0-9\s\-]{1,60})/i', $content, $m) === 1) {
                $entities['report_subject'] = trim((string) $m[1]);
            }

            if (preg_match('/\bmeeting\s+([a-z0-9][a-z0-9\s\-]{1,60})/i', $content, $m) === 1) {
                $entities['meeting'] = trim((string) $m[1]);
            }
        }

        return $entities;
    }

    private function indexKey(int $companyId, int $userId): string
    {
        return "copilot:threads:{$companyId}:{$userId}";
    }

    /**
     * @param  array<int,array<string,mixed>>  $messages
     */
    private function threadTitle(array $messages): string
    {
        foreach ($messages as $message) {
            if (! is_array($message) || (string) ($message['role'] ?? '') !== 'user') {
                continue;
            }

            $content = trim((string) ($message['content'] ?? ''));
            if ($content !== '') {
                return Str::limit($content, 80);
            }
        }

        return 'ELY Conversation';
    }

    /**
     * @param  array<int,array<string,mixed>>  $messages
     * @return array{message_id:string,role:string,snippet:string}|null
     */
    private function firstMessageMatch(array $messages, string $needle): ?array
    {
        foreach ($messages as $message) {
            if (! is_array($message)) {
                continue;
            }

            $content = (string) ($message['content'] ?? '');
            if ($content === '') {
                continue;
            }

            if (! str_contains(strtolower($content), $needle)) {
                continue;
            }

            return [
                'message_id' => (string) ($message['id'] ?? ''),
                'role' => (string) ($message['role'] ?? 'assistant'),
                'snippet' => $this->snippetAroundMatch($content, $needle),
            ];
        }

        return null;
    }

    private function snippetAroundMatch(string $content, string $needle): string
    {
        $lower = strtolower($content);
        $pos = strpos($lower, $needle);
        if ($pos === false) {
            return Str::limit($content, 180);
        }

        $start = max(0, $pos - 60);
        $length = min(mb_strlen($content) - $start, 180);
        $snippet = trim(mb_substr($content, $start, $length));

        if ($start > 0) {
            $snippet = '…' . $snippet;
        }

        if ($start + $length < mb_strlen($content)) {
            $snippet .= '…';
        }

        return $snippet;
    }
}
