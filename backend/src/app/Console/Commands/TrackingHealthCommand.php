<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\Tracking\TrackingHealthService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Throwable;

class TrackingHealthCommand extends Command
{
    protected $signature = 'tracking:health
                            {--json : Output metrics as JSON}
                            {--fail-on-alert : Exit 1 when any tracking alert is active}
                            {--notify : Log active alerts and email TRACKING_ALERT_EMAILS (with cooldown)}';

    protected $description = 'Report tracking system health (sessions, snapshots, realtime relay) and optionally alert';

    public function handle(TrackingHealthService $healthService): int
    {
        $metrics = $healthService->metrics();
        $relay = $metrics['relay'];
        $alerts = $metrics['alerts'];

        if ($this->option('json')) {
            $this->line(json_encode($metrics, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        } else {
            $this->table(
                ['Metric', 'Value'],
                [
                    ['open_sessions', (string) $metrics['open_sessions']],
                    ['abandoned_open_sessions', (string) $metrics['abandoned_open_sessions']],
                    ['abandoned_threshold_seconds', (string) $metrics['abandoned_threshold_seconds']],
                    ['agent_location_snapshots', (string) $metrics['agent_location_snapshots']],
                    ['stale_snapshots', (string) $metrics['stale_snapshots']],
                    ['stale_after_seconds', (string) $metrics['stale_after_seconds']],
                    ['health_abandoned_alert_threshold', (string) $metrics['health_abandoned_alert_threshold']],
                    ['alert_abandoned', $metrics['alert_abandoned'] ? 'yes' : 'no'],
                    ['relay_checked', $relay['checked'] ? 'yes' : 'no'],
                    ['relay_status', $relay['checked'] ? ($relay['reachable'] ? (string) $relay['status'] : 'unreachable') : '-'],
                    ['relay_redis_ready', $relay['redis_ready'] === null ? '-' : ($relay['redis_ready'] ? 'yes' : 'no')],
                    ['relay_connections', $relay['connections'] === null ? '-' : (string) $relay['connections']],
                    ['relay_auth_failures_15m', $relay['auth_failures_15m'] === null ? '-' : (string) $relay['auth_failures_15m']],
                    ['active_alerts', $alerts === [] ? 'none' : implode(', ', array_column($alerts, 'key'))],
                    ['generated_at', $metrics['generated_at']],
                ],
            );
        }

        if ($this->option('notify')) {
            $this->notify($alerts);
        }

        if ($this->option('fail-on-alert') && $alerts !== []) {
            // Keep --json output machine-readable; alerts are already in the payload.
            if (! $this->option('json')) {
                foreach ($alerts as $alert) {
                    $this->error($alert['message']);
                }
            }

            return self::FAILURE;
        }

        return self::SUCCESS;
    }

    /**
     * @param  array<int, array{key: string, message: string}>  $alerts
     */
    private function notify(array $alerts): void
    {
        $recipients = (array) config('tracking.alert_emails', []);
        $cooldownMinutes = max(1, (int) config('tracking.alert_cooldown_minutes', 60));

        foreach ($alerts as $alert) {
            Log::error('[tracking-alert] ' . $alert['message'], ['alert' => $alert['key']]);

            if ($recipients === []) {
                continue;
            }

            // Cache::add only succeeds when the key is absent -> one email per cooldown window.
            if (! Cache::add('tracking-alert:' . $alert['key'], now()->toIso8601String(), now()->addMinutes($cooldownMinutes))) {
                continue;
            }

            try {
                $body = $alert['message'] . "\n\nRun `php artisan tracking:health` on the API container for details.\n"
                    . 'Environment: ' . app()->environment() . ' (' . config('app.url') . ')';
                $callback = function ($message) use ($recipients, $alert): void {
                    $message->to($recipients)->subject('[Factory23] Tracking alert: ' . $alert['key']);
                };

                $mailer = config('tracking.alert_mailer');
                if (is_string($mailer) && $mailer !== '') {
                    Mail::mailer($mailer)->raw($body, $callback);
                } else {
                    Mail::raw($body, $callback);
                }
            } catch (Throwable $e) {
                // Let the next run retry instead of waiting out the cooldown.
                Cache::forget('tracking-alert:' . $alert['key']);
                Log::error('[tracking-alert] failed to email alert', ['alert' => $alert['key'], 'exception' => $e->getMessage()]);
            }
        }
    }
}
