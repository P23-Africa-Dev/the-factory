<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\FieldActivitySession;
use App\Models\FieldDailySummary;
use App\Models\FieldLocationPoint;
use App\Models\FieldStop;
use App\Services\FieldActivity\FieldActivityAlertService;
use App\Services\FieldActivity\FieldDailySummaryService;
use Illuminate\Console\Command;

class PruneFieldActivityDataCommand extends Command
{
    protected $signature = 'field-activity:prune {--days= : Override retention days}';

    protected $description = 'Prune old field activity points and closed sessions beyond retention.';

    public function handle(): int
    {
        $days = (int) ($this->option('days') ?: config('field_activity.retention_days', 90));
        $chunk = (int) config('field_activity.prune_chunk_size', 1000);
        $cutoff = now()->subDays(max(1, $days));

        $deletedPoints = 0;
        FieldLocationPoint::query()
            ->where('recorded_at', '<', $cutoff)
            ->orderBy('id')
            ->chunkById($chunk, function ($points) use (&$deletedPoints): void {
                $ids = $points->pluck('id')->all();
                $deletedPoints += FieldLocationPoint::query()->whereIn('id', $ids)->delete();
            });

        $deletedStops = FieldStop::query()
            ->where('arrived_at', '<', $cutoff)
            ->whereNotNull('departed_at')
            ->delete();

        $deletedSessions = FieldActivitySession::query()
            ->whereNotNull('ended_at')
            ->where('ended_at', '<', $cutoff)
            ->delete();

        $this->info("Pruned field activity older than {$days} days.");
        $this->line("points={$deletedPoints} stops={$deletedStops} sessions={$deletedSessions}");

        return self::SUCCESS;
    }
}
