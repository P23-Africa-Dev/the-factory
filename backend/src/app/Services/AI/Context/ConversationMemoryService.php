<?php

declare(strict_types=1);

namespace App\Services\AI\Context;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class ConversationMemoryService
{
    private const THREAD_TTL_SECONDS = 604800;

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

    private function indexKey(int $companyId, int $userId): string
    {
        return "copilot:threads:{$companyId}:{$userId}";
    }
}
