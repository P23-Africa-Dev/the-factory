<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\AgentLocationSnapshot;
use App\Models\TaskLocationPoint;
use App\Models\TaskTrackingSession;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class PruneTaskTrackingDataCommand extends Command
{
    protected $signature = 'tracking:prune {--days= : Override retention days} {--dry-run : Show what would be deleted without deleting}';

    protected $description = 'Prune old task tracking sessions and location points based on retention policy';

    public function handle(): int
    {
        $retentionDays = (int) ($this->option('days') ?: config('tracking.retention_days', 90));

        if ($retentionDays < 1) {
            $this->error('Retention days must be at least 1.');

            return self::FAILURE;
        }

        $cutoff = now()->subDays($retentionDays);
        $chunkSize = max(100, (int) config('tracking.prune_chunk_size', 1000));
        $dryRun = (bool) $this->option('dry-run');

        $oldSessionsQuery = TaskTrackingSession::query()
            ->whereNotNull('end_recorded_at')
            ->where('end_recorded_at', '<', $cutoff);

        $oldNonCheckpointPointsQuery = TaskLocationPoint::query()
            ->where('recorded_at', '<', $cutoff)
            ->where('is_checkpoint', false)
            ->whereHas('session', function ($query) use ($cutoff): void {
                $query->where(function ($sessionQuery) use ($cutoff): void {
                    $sessionQuery
                        ->whereNull('end_recorded_at')
                        ->orWhere('end_recorded_at', '>=', $cutoff);
                });
            });

        $oldSessionsCount = (clone $oldSessionsQuery)->count();
        $oldNonCheckpointPointsCount = (clone $oldNonCheckpointPointsQuery)->count();

        $this->info(sprintf(
            'Tracking prune scan complete. cutoff=%s sessions=%d non_checkpoint_points=%d',
            $cutoff->toIso8601String(),
            $oldSessionsCount,
            $oldNonCheckpointPointsCount,
        ));

        Log::info('[tracking] prune_scan', [
            'cutoff' => $cutoff->toIso8601String(),
            'retention_days' => $retentionDays,
            'old_sessions' => $oldSessionsCount,
            'old_non_checkpoint_points' => $oldNonCheckpointPointsCount,
            'dry_run' => $dryRun,
        ]);

        if ($dryRun) {
            $this->line('Dry run mode enabled. No records were deleted.');

            return self::SUCCESS;
        }

        $deletedSessions = $this->deleteInChunks($oldSessionsQuery, $chunkSize, TaskTrackingSession::class);
        $deletedPoints = $this->deleteInChunks($oldNonCheckpointPointsQuery, $chunkSize, TaskLocationPoint::class);

        // Clear stale live snapshots whose last_seen is older than retention so
        // lat/lng PII does not linger after trails are pruned.
        $staleSnapshotsQuery = AgentLocationSnapshot::query()
            ->where(function ($query) use ($cutoff): void {
                $query
                    ->where(function ($inner) use ($cutoff): void {
                        $inner
                            ->whereNotNull('last_seen_at')
                            ->where('last_seen_at', '<', $cutoff);
                    })
                    ->orWhere(function ($inner) use ($cutoff): void {
                        $inner
                            ->whereNull('last_seen_at')
                            ->where('updated_at', '<', $cutoff);
                    });
            });
        $deletedSnapshots = $this->deleteInChunks(
            $staleSnapshotsQuery,
            $chunkSize,
            AgentLocationSnapshot::class,
        );

        $this->info(sprintf(
            'Tracking prune completed. deleted_sessions=%d deleted_non_checkpoint_points=%d deleted_snapshots=%d',
            $deletedSessions,
            $deletedPoints,
            $deletedSnapshots,
        ));

        Log::info('[tracking] prune_completed', [
            'cutoff' => $cutoff->toIso8601String(),
            'retention_days' => $retentionDays,
            'deleted_sessions' => $deletedSessions,
            'deleted_non_checkpoint_points' => $deletedPoints,
            'deleted_snapshots' => $deletedSnapshots,
        ]);

        return self::SUCCESS;
    }

    private function deleteInChunks($query, int $chunkSize, string $modelClass): int
    {
        $deleted = 0;

        while (true) {
            $ids = (clone $query)
                ->limit($chunkSize)
                ->pluck('id')
                ->all();

            if (count($ids) === 0) {
                break;
            }

            $deleted += $modelClass::query()->whereIn('id', $ids)->delete();
        }

        return $deleted;
    }
}
