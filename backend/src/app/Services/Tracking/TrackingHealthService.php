<?php

declare(strict_types=1);

namespace App\Services\Tracking;

use App\Models\AgentLocationSnapshot;
use App\Models\TaskTrackingSession;
use Carbon\Carbon;
use Illuminate\Support\Facades\Http;
use Throwable;

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
            'relay' => $relay = $this->relayHealth(),
            'alerts' => $this->alerts($abandonedOpenSessions > $alertThreshold, $abandonedOpenSessions, $alertThreshold, $relay),
            'generated_at' => $now->toIso8601String(),
        ];
    }

    /**
     * Probe the realtime relay's /healthz. Skipped when no URL is configured.
     *
     * @return array{checked: bool, reachable: bool|null, status: string|null, redis_ready: bool|null, connections: int|null, auth_failures_15m: int|null, auth_permanent_failures_15m: int|null, error: string|null}
     */
    public function relayHealth(): array
    {
        $url = config('tracking.realtime_health_url');

        $result = [
            'checked' => false,
            'reachable' => null,
            'status' => null,
            'redis_ready' => null,
            'connections' => null,
            'auth_failures_15m' => null,
            'auth_permanent_failures_15m' => null,
            'error' => null,
        ];

        if (! is_string($url) || trim($url) === '') {
            return $result;
        }

        $result['checked'] = true;

        try {
            $response = Http::timeout(max(1, (int) config('tracking.realtime_health_timeout_seconds', 3)))
                ->acceptJson()
                ->get($url);
            $body = $response->json() ?? [];

            $result['reachable'] = true;
            $result['status'] = (string) ($body['status'] ?? ($response->successful() ? 'ok' : 'unknown'));
            $result['redis_ready'] = isset($body['redis']['ready']) ? (bool) $body['redis']['ready'] : null;
            $result['connections'] = isset($body['connections']) ? (int) $body['connections'] : null;
            $result['auth_failures_15m'] = isset($body['auth']['failures']) ? (int) $body['auth']['failures'] : null;
            $result['auth_permanent_failures_15m'] = isset($body['auth']['permanent_failures']) ? (int) $body['auth']['permanent_failures'] : null;
        } catch (Throwable $e) {
            $result['reachable'] = false;
            $result['error'] = $e->getMessage();
        }

        return $result;
    }

    /**
     * @return array<int, array{key: string, message: string}>
     */
    private function alerts(bool $abandonedAlert, int $abandoned, int $abandonedThreshold, array $relay): array
    {
        $alerts = [];

        if ($abandonedAlert) {
            $alerts[] = [
                'key' => 'abandoned_sessions',
                'message' => "Abandoned open tracking sessions ({$abandoned}) exceed threshold ({$abandonedThreshold}).",
            ];
        }

        if ($relay['checked'] && $relay['reachable'] === false) {
            $alerts[] = [
                'key' => 'relay_unreachable',
                'message' => 'Realtime tracking relay is unreachable: ' . ($relay['error'] ?? 'unknown error') . '. Live map updates are down.',
            ];
        } elseif ($relay['checked'] && ($relay['status'] !== 'ok' || $relay['redis_ready'] === false)) {
            $alerts[] = [
                'key' => 'relay_degraded',
                'message' => "Realtime tracking relay is degraded (status={$relay['status']}, redis_ready=" . var_export($relay['redis_ready'], true) . '). Live map updates may be delayed or missing.',
            ];
        }

        $failureThreshold = max(1, (int) config('tracking.health_relay_auth_failures_alert_threshold', 50));
        if ($relay['auth_failures_15m'] !== null && $relay['auth_failures_15m'] > $failureThreshold) {
            $alerts[] = [
                'key' => 'relay_auth_failures',
                'message' => "Realtime relay rejected {$relay['auth_failures_15m']} socket logins in 15 min (threshold {$failureThreshold}). Some dashboards are not receiving live updates.",
            ];
        }

        return $alerts;
    }
}
