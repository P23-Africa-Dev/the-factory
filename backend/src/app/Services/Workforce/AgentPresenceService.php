<?php

declare(strict_types=1);

namespace App\Services\Workforce;

use App\Models\AgentLocationSnapshot;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class AgentPresenceService
{
    /**
     * @param  list<int>  $userIds
     * @return array<int, array<string, mixed>>
     */
    public function resolveForCompany(int $companyId, array $userIds): array
    {
        if ($userIds === []) {
            return [];
        }

        $mapStaleSeconds = $this->mapStaleAfterSeconds();
        $sessionStaleSeconds = $this->sessionStaleAfterSeconds();

        $snapshots = AgentLocationSnapshot::query()
            ->with('task:id,title')
            ->where('company_id', $companyId)
            ->whereIn('user_id', $userIds)
            ->get()
            ->keyBy('user_id');

        $sessionRows = DB::table('personal_access_tokens')
            ->select('tokenable_id as user_id', DB::raw('MAX(last_used_at) as last_session_at'))
            ->where('tokenable_type', User::class)
            ->whereIn('tokenable_id', $userIds)
            ->groupBy('tokenable_id')
            ->get()
            ->keyBy('user_id');

        $resolved = [];

        foreach ($userIds as $userId) {
            $snapshot = $snapshots->get($userId);
            $sessionRow = $sessionRows->get($userId);
            $lastSessionAt = $sessionRow?->last_session_at !== null
                ? Carbon::parse((string) $sessionRow->last_session_at)
                : null;

            $resolved[$userId] = $this->buildPresence(
                snapshot: $snapshot,
                lastSessionAt: $lastSessionAt,
                mapStaleSeconds: $mapStaleSeconds,
                sessionStaleSeconds: $sessionStaleSeconds,
            );
        }

        return $resolved;
    }

    /**
     * @return array<string, mixed>
     */
    public function emptyPresence(): array
    {
        return [
            'is_session_online' => false,
            'is_map_active' => false,
            'last_seen_at' => null,
            'last_session_at' => null,
            'active_task_id' => null,
            'active_task_title' => null,
            'latitude' => null,
            'longitude' => null,
        ];
    }

    public function mapStaleAfterSeconds(): int
    {
        return max(60, (int) config('tracking.agent_location_stale_after_seconds', 300));
    }

    public function sessionStaleAfterSeconds(): int
    {
        return max(60, (int) config('tracking.session_stale_after_seconds', 900));
    }

    public function mapActiveCutoff(): Carbon
    {
        return now()->subSeconds($this->mapStaleAfterSeconds());
    }

    public function sessionOnlineCutoff(): Carbon
    {
        return now()->subSeconds($this->sessionStaleAfterSeconds());
    }

    /**
     * @return array<string, mixed>
     */
    private function buildPresence(
        ?AgentLocationSnapshot $snapshot,
        ?Carbon $lastSessionAt,
        int $mapStaleSeconds,
        int $sessionStaleSeconds,
    ): array {
        $lastSeenAt = $snapshot?->last_seen_at;
        $mapAgeSeconds = $lastSeenAt !== null
            ? max(0, now()->getTimestamp() - $lastSeenAt->getTimestamp())
            : null;
        $isMapActive = $mapAgeSeconds !== null && $mapAgeSeconds <= $mapStaleSeconds;

        $sessionAgeSeconds = $lastSessionAt !== null
            ? max(0, now()->getTimestamp() - $lastSessionAt->getTimestamp())
            : null;
        $isSessionOnline = $sessionAgeSeconds !== null && $sessionAgeSeconds <= $sessionStaleSeconds;

        return [
            'is_session_online' => $isSessionOnline,
            'is_map_active' => $isMapActive,
            'last_seen_at' => $lastSeenAt?->toIso8601String(),
            'last_session_at' => $lastSessionAt?->toIso8601String(),
            'active_task_id' => $snapshot?->task_id,
            'active_task_title' => $snapshot?->task?->title,
            'latitude' => $snapshot?->latitude,
            'longitude' => $snapshot?->longitude,
        ];
    }
}
