<?php

declare(strict_types=1);

namespace App\Services\AI\Admin;

use Illuminate\Support\Facades\Cache;

class AiFailoverTracker
{
    public const CACHE_KEY_LATEST = 'ai:provider:failover:latest';

    public const CACHE_KEY_HISTORY = 'ai:provider:failover:history';

    public function record(string $fromProvider, string $toProvider, string $reason = 'provider_unavailable'): void
    {
        $event = [
            'from' => $fromProvider,
            'to' => $toProvider,
            'reason' => $reason,
            'message' => ucfirst($fromProvider) . ' unavailable → Routed to ' . ucfirst($toProvider),
            'occurred_at' => now()->toIso8601String(),
        ];

        try {
            Cache::put(self::CACHE_KEY_LATEST, $event, 86400);

            $history = Cache::get(self::CACHE_KEY_HISTORY, []);
            if (! is_array($history)) {
                $history = [];
            }

            array_unshift($history, $event);
            $history = array_slice($history, 0, 20);
            Cache::put(self::CACHE_KEY_HISTORY, $history, 86400);
        } catch (\Throwable) {
            // Failover tracking is best-effort when cache is unavailable.
        }
    }

    /**
     * @return array<string, mixed>|null
     */
    public function latest(): ?array
    {
        try {
            $latest = Cache::get(self::CACHE_KEY_LATEST);
        } catch (\Throwable) {
            return null;
        }

        return is_array($latest) ? $latest : null;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function history(): array
    {
        try {
            $history = Cache::get(self::CACHE_KEY_HISTORY, []);
        } catch (\Throwable) {
            return [];
        }

        return is_array($history) ? $history : [];
    }
}
