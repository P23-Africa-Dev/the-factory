<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\Tracking\TrackingHealthService;
use Illuminate\Console\Command;

class TrackingHealthCommand extends Command
{
    protected $signature = 'tracking:health
                            {--json : Output metrics as JSON}
                            {--fail-on-alert : Exit 1 when abandoned open sessions exceed the alert threshold}';

    protected $description = 'Report tracking system health metrics (open sessions, abandoned sessions, stale snapshots)';

    public function handle(TrackingHealthService $healthService): int
    {
        $metrics = $healthService->metrics();

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
                    ['generated_at', $metrics['generated_at']],
                ],
            );
        }

        if ($this->option('fail-on-alert') && $metrics['alert_abandoned']) {
            $this->error(sprintf(
                'Abandoned open sessions (%d) exceed alert threshold (%d).',
                $metrics['abandoned_open_sessions'],
                $metrics['health_abandoned_alert_threshold'],
            ));

            return self::FAILURE;
        }

        return self::SUCCESS;
    }
}
