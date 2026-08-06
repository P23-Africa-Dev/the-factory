<?php

declare(strict_types=1);

namespace App\Services\Tracking;

use App\Models\AgentLocationSnapshot;
use App\Models\TaskTrackingSession;
use Carbon\Carbon;

class TrackingHealthService
{
    /**
     * @return array{
     *     open_sessions: int,
     *     abandoned_open_sessions: int,
     *     abandoned_threshold_seconds: int,
     *     abandoned_cutoff: string,
     *     agent_location_snapshots: int,
     *     stale_snapshots: int,
     *     stale_after_seconds: int,
     *     stale_cutoff: string,
     *     health_abandoned_alert_threshold: int,
     *     alert_abandoned: bool,
     *     generated_at: string
     * }
     */
    public function metrics(?Carbon $now = null): array
    {
        $now ??= now();

        $abandonedAfterSeconds = max(300, (int) config('tracking.abandoned_session_after_seconds', 21600));
        $staleAfterSeconds = max(60, (int) config('tracking.agent_location_stale_after_seconds', 300));
        $alertThreshold = max(1, (int) config('tracking.health_abandoned_alert_threshold', 50));

        $abandonedCutoff = $now->copy()->subSeconds($abandonedAfterSeconds);
        $staleCutoff = $now->copy()->subSeconds($staleAfterSeconds);

        $openSessions = TaskTrackingSession::query()
            ->whereNull('end_recorded_at')
            ->count();

        $abandonedOpenSessions = TaskTrackingSession::query()
            ->whereNull('end_recorded_at')
            ->where(function ($query) use ($abandonedCutoff): void {
                $query
                    ->where(function ($inner) use ($abandonedCutoff): void {
                        $inner
                            ->whereNotNull('last_recorded_at')
                            ->where('last_recorded_at', '<', $abandonedCutoff);
                    })
                    ->orWhere(function ($inner) use ($abandonedCutoff): void {
                        $inner
                            ->whereNull('last_recorded_at')
                            ->where('start_recorded_at', '<', $abandonedCutoff);
                    });
            })
            ->count();

        $snapshots = AgentLocationSnapshot::query()->count();

        $staleSnapshots = AgentLocationSnapshot::query()
            ->where(function ($query) use ($staleCutoff): void {
                $query
                    ->where(function ($inner) use ($staleCutoff): void {
                        $inner
                            ->whereNotNull('last_seen_at')
                            ->where('last_seen_at', '<', $staleCutoff);
                    })
                    ->orWhere(function ($inner) use ($staleCutoff): void {
                        $inner
                            ->whereNull('last_seen_at')
                            ->where('updated_at', '<', $staleCutoff);
                    });
            })
            ->count();

        return [
            'open_sessions' => $openSessions,
            'abandoned_open_sessions' => $abandonedOpenSessions,
            'abandoned_threshold_seconds' => $abandonedAfterSeconds,
            'abandoned_cutoff' => $abandonedCutoff->toIso8601String(),
            'agent_location_snapshots' => $snapshots,
            'stale_snapshots' => $staleSnapshots,
            'stale_after_seconds' => $staleAfterSeconds,
            'stale_cutoff' => $staleCutoff->toIso8601String(),
            'health_abandoned_alert_threshold' => $alertThreshold,
            'alert_abandoned' => $abandonedOpenSessions > $alertThreshold,
            'generated_at' => $now->toIso8601String(),
        ];
    }
}
