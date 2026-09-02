<?php

declare(strict_types=1);

namespace App\Services\AI;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class ActionDraftStore
{
    private const TTL_SECONDS = 60 * 60 * 24;

    /**
     * @param  array<string, mixed>  $actionArgs
     * @param  array<int, string>  $warningCodes
     * @param  array<int, string>  $blockingWarningCodes
     * @return array{draft_id: string, draft_version: int, tool: string, action_args: array<string, mixed>, warning_codes: array<int, string>, blocking_warning_codes: array<int, string>, consumed: bool}
     */
    public function put(
        int $companyId,
        int $userId,
        string $threadId,
        string $tool,
        array $actionArgs,
        array $warningCodes = [],
        array $blockingWarningCodes = [],
        ?string $draftId = null,
        ?int $version = null,
    ): array {
        $existing = $this->get($companyId, $userId, $threadId);
        $id = is_string($draftId) && $draftId !== ''
            ? $draftId
            : (is_array($existing) ? (string) $existing['draft_id'] : (string) Str::uuid());
        $nextVersion = $version ?? ((is_array($existing) ? (int) $existing['draft_version'] : 0) + 1);

        $draft = [
            'draft_id' => $id,
            'draft_version' => max(1, $nextVersion),
            'tool' => $tool,
            'action_args' => $actionArgs,
            'warning_codes' => array_values($warningCodes),
            'blocking_warning_codes' => array_values($blockingWarningCodes),
            'consumed' => false,
            'updated_at' => now()->toIso8601String(),
        ];

        Cache::put($this->key($companyId, $userId, $threadId), $draft, self::TTL_SECONDS);

        return $draft;
    }

    /**
     * @return array{draft_id: string, draft_version: int, tool: string, action_args: array<string, mixed>, warning_codes: array<int, string>, blocking_warning_codes: array<int, string>, consumed: bool}|null
     */
    public function get(int $companyId, int $userId, string $threadId): ?array
    {
        $draft = Cache::get($this->key($companyId, $userId, $threadId));
        if (! is_array($draft)) {
            return null;
        }

        if (($draft['consumed'] ?? false) === true) {
            return null;
        }

        return [
            'draft_id' => (string) ($draft['draft_id'] ?? ''),
            'draft_version' => (int) ($draft['draft_version'] ?? 1),
            'tool' => (string) ($draft['tool'] ?? ''),
            'action_args' => is_array($draft['action_args'] ?? null) ? $draft['action_args'] : [],
            'warning_codes' => array_values(array_map('strval', is_array($draft['warning_codes'] ?? null) ? $draft['warning_codes'] : [])),
            'blocking_warning_codes' => array_values(array_map('strval', is_array($draft['blocking_warning_codes'] ?? null) ? $draft['blocking_warning_codes'] : [])),
            'consumed' => false,
        ];
    }

    public function markConsumed(int $companyId, int $userId, string $threadId, ?string $draftId = null): void
    {
        $draft = Cache::get($this->key($companyId, $userId, $threadId));
        if (! is_array($draft)) {
            return;
        }

        if (is_string($draftId) && $draftId !== '' && (string) ($draft['draft_id'] ?? '') !== $draftId) {
            return;
        }

        $draft['consumed'] = true;
        $draft['updated_at'] = now()->toIso8601String();
        Cache::put($this->key($companyId, $userId, $threadId), $draft, self::TTL_SECONDS);
    }

    public function clear(int $companyId, int $userId, string $threadId): void
    {
        Cache::forget($this->key($companyId, $userId, $threadId));
    }

    private function key(int $companyId, int $userId, string $threadId): string
    {
        return sprintf('ely:action-draft:%d:%d:%s', $companyId, $userId, trim($threadId));
    }
}
