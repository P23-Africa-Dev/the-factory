<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Models\Task;
use App\Models\TaskTrackingSession;
use App\Models\User;
use App\Services\Demo\DemoRouteInterpolator;
use App\Services\Task\TaskTrackingService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class SimulateDemoAgentMovementJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public function __construct(
        public readonly int $sessionId,
        public readonly int $taskId,
        public readonly int $userId,
        public readonly int $companyId,
    ) {}

    public function handle(TaskTrackingService $trackingService, DemoRouteInterpolator $interpolator): void
    {
        $session = TaskTrackingSession::query()->find($this->sessionId);
        $task = Task::query()->find($this->taskId);
        $user = User::query()->find($this->userId);

        if ($session === null || $task === null || $user === null || $session->end_recorded_at !== null) {
            return;
        }

        $destLat = (float) ($session->destination_latitude ?? $task->latitude);
        $destLng = (float) ($session->destination_longitude ?? $task->longitude);
        $startLat = (float) ($session->start_latitude ?? $destLat);
        $startLng = (float) ($session->start_longitude ?? $destLng);

        $points = $interpolator->interpolateRoute(
            startLat: $startLat,
            startLng: $startLng,
            destLat: $destLat,
            destLng: $destLng,
            startedAt: $session->start_recorded_at ?? now(),
        );

        $interval = max(1, (int) config('demo.tracking_simulation_interval_seconds', 8));

        foreach ($points as $index => $point) {
            if ($index > 0) {
                sleep($interval);
            }

            $session = TaskTrackingSession::query()->find($this->sessionId);
            $task = Task::query()->find($this->taskId);

            if ($session === null || $task === null || $session->end_recorded_at !== null) {
                return;
            }

            try {
                $trackingService->recordLocation($user, $task, [
                    'company_id' => $this->companyId,
                    'latitude' => $point['latitude'],
                    'longitude' => $point['longitude'],
                    'accuracy_meters' => $point['accuracy_meters'],
                    'speed_mps' => $point['speed_mps'],
                    'heading_degrees' => $point['heading_degrees'],
                    'recorded_at' => $point['recorded_at'],
                ]);
            } catch (\Throwable $exception) {
                Log::warning('Demo tracking simulation step failed.', [
                    'session_id' => $this->sessionId,
                    'task_id' => $this->taskId,
                    'step' => $index,
                    'message' => $exception->getMessage(),
                ]);

                return;
            }
        }
    }
}
