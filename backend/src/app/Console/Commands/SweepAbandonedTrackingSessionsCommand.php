<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\AgentLocationSnapshot;
use App\Models\TaskLocationPoint;
use App\Models\TaskTrackingSession;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class SweepAbandonedTrackingSessionsCommand extends Command
{
    protected $signature = 'tracking:sweep-abandoned {--dry-run : Show what would be closed without closing}';

    protected $description = 'Auto-close abandoned open task-tracking sessions so presence heartbeats and live map stay accurate';

    public function handle(): int
    {
        $staleAfterSeconds = max(300, (int) config('tracking.abandoned_session_after_seconds', 21600));
        $cutoff = now()->subSeconds($staleAfterSeconds);
        $dryRun = (bool) $this->option('dry-run');

        $sessions = TaskTrackingSession::query()
            ->whereNull('end_recorded_at')
            ->where(function ($query) use ($cutoff): void {
                $query
                    ->where(function ($inner) use ($cutoff): void {
                        $inner
                            ->whereNotNull('last_recorded_at')
                            ->where('last_recorded_at', '<', $cutoff);
                    })
                    ->orWhere(function ($inner) use ($cutoff): void {
                        $inner
                            ->whereNull('last_recorded_at')
                            ->where('start_recorded_at', '<', $cutoff);
                    });
            })
            ->orderBy('id')
            ->get();

        $this->info(sprintf(
            'Abandoned tracking sweep. cutoff=%s candidates=%d dry_run=%s',
            $cutoff->toIso8601String(),
            $sessions->count(),
            $dryRun ? 'yes' : 'no',
        ));

        $closed = 0;

        foreach ($sessions as $session) {
            $endedAt = now();

            Log::info('[tracking] abandoned_session_sweep', [
                'tracking_session_id' => $session->id,
                'task_id' => $session->task_id,
                'company_id' => $session->company_id,
                'started_by_user_id' => $session->started_by_user_id,
                'last_recorded_at' => $session->last_recorded_at?->toIso8601String(),
                'dry_run' => $dryRun,
            ]);

            if ($dryRun) {
                $closed++;
                continue;
            }

            $session->end_latitude = $session->last_latitude ?? $session->start_latitude;
            $session->end_longitude = $session->last_longitude ?? $session->start_longitude;
            $session->end_accuracy_meters = $session->last_accuracy_meters;
            $session->end_recorded_at = $endedAt;
            $session->completed_by_user_id = $session->started_by_user_id;
            $session->save();

            TaskLocationPoint::query()->create([
                'tracking_session_id' => $session->id,
                'task_id' => $session->task_id,
                'company_id' => $session->company_id,
                'user_id' => $session->started_by_user_id,
                'latitude' => $session->end_latitude,
                'longitude' => $session->end_longitude,
                'accuracy_meters' => $session->end_accuracy_meters,
                'speed_mps' => null,
                'heading_degrees' => null,
                'event_type' => 'auto_closed',
                'is_checkpoint' => true,
                'recorded_at' => $endedAt,
            ]);

            // Clear task linkage on the live snapshot so presence heartbeats can resume.
            AgentLocationSnapshot::query()
                ->where('company_id', $session->company_id)
                ->where('user_id', $session->started_by_user_id)
                ->where('tracking_session_id', $session->id)
                ->update([
                    'task_id' => null,
                    'tracking_session_id' => null,
                    'event_type' => 'auto_closed',
                    'task_status' => null,
                    'arrived' => false,
                    'updated_at' => $endedAt,
                ]);

            $closed++;
        }

        $this->info(sprintf('Abandoned tracking sweep completed. closed=%d', $closed));

        return self::SUCCESS;
    }
}
