<?php

declare(strict_types=1);

namespace App\Services\Task;

use App\Enums\TaskStatus;
use App\Models\Task;
use App\Models\TaskLocationPoint;
use App\Models\TaskProof;
use App\Models\TaskTrackingSession;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Redis;
use Illuminate\Validation\ValidationException;
use Throwable;

class TaskTrackingService
{
    public function __construct(
        private readonly TaskAccessService $accessService,
        private readonly TaskService $taskService,
    ) {}

    public function start(User $user, Task $task, array $data): array
    {
        $context = $this->accessService->resolve($user, $data['company_id'] ?? null);
        $this->accessService->ensureAgent($context);
        $this->assertTaskInCompany($task, $context->company->id);
        $this->ensureAssignedUser($task, $user);

        if (! (bool) ($data['location_permission_granted'] ?? false)) {
            throw ValidationException::withMessages([
                'location_permission_granted' => ['Location permission is required to start tracking.'],
            ]);
        }

        if ($this->isTerminalStatus($task->status?->value)) {
            throw ValidationException::withMessages([
                'task' => ['Terminal tasks cannot be started for tracking.'],
            ]);
        }

        if ($task->status?->value === TaskStatus::PENDING->value) {
            $task = $this->taskService->updateStatus(
                user: $user,
                task: $task,
                status: TaskStatus::IN_PROGRESS->value,
                companyId: $context->company->id,
            );
        }

        if ($task->status?->value !== TaskStatus::IN_PROGRESS->value) {
            throw ValidationException::withMessages([
                'task' => ['Task must be in progress before tracking can start.'],
            ]);
        }

        $activeSession = TaskTrackingSession::query()
            ->where('task_id', $task->id)
            ->whereNull('end_recorded_at')
            ->first();

        if ($activeSession) {
            throw ValidationException::withMessages([
                'tracking' => ['Tracking is already active for this task.'],
            ]);
        }

        $recordedAt = isset($data['recorded_at']) ? Carbon::parse((string) $data['recorded_at']) : now();
        $latitude = (float) $data['latitude'];
        $longitude = (float) $data['longitude'];
        $accuracy = array_key_exists('accuracy_meters', $data) && $data['accuracy_meters'] !== null
            ? (float) $data['accuracy_meters']
            : null;

        return DB::transaction(function () use ($user, $task, $context, $latitude, $longitude, $accuracy, $recordedAt): array {
            $session = TaskTrackingSession::query()->create([
                'task_id' => $task->id,
                'company_id' => $context->company->id,
                'started_by_user_id' => $user->id,
                'start_latitude' => $latitude,
                'start_longitude' => $longitude,
                'start_accuracy_meters' => $accuracy,
                'start_recorded_at' => $recordedAt,
                'last_latitude' => $latitude,
                'last_longitude' => $longitude,
                'last_accuracy_meters' => $accuracy,
                'last_recorded_at' => $recordedAt,
                'last_persisted_latitude' => $latitude,
                'last_persisted_longitude' => $longitude,
                'last_persisted_recorded_at' => $recordedAt,
                'destination_latitude' => $task->latitude,
                'destination_longitude' => $task->longitude,
                'destination_radius_meters' => (int) config('tracking.arrival_radius_meters', 75),
            ]);

            $this->createLocationPoint(
                session: $session,
                task: $task,
                user: $user,
                latitude: $latitude,
                longitude: $longitude,
                recordedAt: $recordedAt,
                eventType: 'start',
                isCheckpoint: true,
                accuracyMeters: $accuracy,
                speedMps: null,
                headingDegrees: null,
            );

            $arrivedNow = $this->markArrivalIfWithinRadius($session, $task, $user, $latitude, $longitude, $recordedAt, $accuracy);

            $payload = [
                'task_status' => $task->status?->value,
                'latitude' => $latitude,
                'longitude' => $longitude,
                'accuracy_meters' => $accuracy,
                'arrived' => $arrivedNow,
                'event_type' => 'start',
            ];

            $this->publishTrackingEvent('tracking.task.started', $context->company->id, $task->id, $session->id, $user->id, $payload, $recordedAt);
            $this->publishTrackingEvent('tracking.location.updated', $context->company->id, $task->id, $session->id, $user->id, $payload, $recordedAt);

            if ($arrivedNow) {
                $this->publishTrackingEvent('tracking.task.arrived', $context->company->id, $task->id, $session->id, $user->id, $payload, $recordedAt);
            }

            return [
                'task' => $this->loadTaskForResponse($task),
                'session' => $session->fresh(),
                'arrived' => $arrivedNow,
            ];
        });
    }

    public function recordLocation(User $user, Task $task, array $data): array
    {
        $context = $this->accessService->resolve($user, $data['company_id'] ?? null);
        $this->accessService->ensureAgent($context);
        $this->assertTaskInCompany($task, $context->company->id);
        $this->ensureAssignedUser($task, $user);

        if ($task->status?->value !== TaskStatus::IN_PROGRESS->value) {
            throw ValidationException::withMessages([
                'task' => ['Location updates are only allowed while task is in progress.'],
            ]);
        }

        $session = TaskTrackingSession::query()
            ->where('task_id', $task->id)
            ->whereNull('end_recorded_at')
            ->first();

        if (! $session) {
            throw ValidationException::withMessages([
                'tracking' => ['Tracking session is not active for this task.'],
            ]);
        }

        $points = $this->normalizeIncomingPoints($data);
        $maxBatch = (int) config('tracking.max_batch_points', 50);

        if ($points->count() > $maxBatch) {
            throw ValidationException::withMessages([
                'points' => ["Location batch exceeds the maximum of {$maxBatch} points."],
            ]);
        }

        $persistedCount = 0;
        $arrivedNow = false;

        DB::transaction(function () use ($points, $session, $task, $user, &$persistedCount, &$arrivedNow): void {
            foreach ($points as $point) {
                $latitude = (float) $point['latitude'];
                $longitude = (float) $point['longitude'];
                $accuracy = isset($point['accuracy_meters']) ? (float) $point['accuracy_meters'] : null;
                $speed = isset($point['speed_mps']) ? (float) $point['speed_mps'] : null;
                $heading = isset($point['heading_degrees']) ? (float) $point['heading_degrees'] : null;
                $recordedAt = isset($point['recorded_at']) ? Carbon::parse((string) $point['recorded_at']) : now();

                $session->last_latitude = $latitude;
                $session->last_longitude = $longitude;
                $session->last_accuracy_meters = $accuracy;
                $session->last_recorded_at = $recordedAt;

                $eventType = 'movement';
                $isCheckpoint = false;

                $justArrived = $this->shouldMarkArrival($session, $latitude, $longitude);
                if ($justArrived) {
                    $arrivedNow = true;
                    $eventType = 'arrival';
                    $isCheckpoint = true;

                    $session->arrival_detected_at = $recordedAt;
                    $session->arrival_latitude = $latitude;
                    $session->arrival_longitude = $longitude;
                }

                $shouldPersist = $isCheckpoint || $this->shouldPersistMovementPoint($session, $latitude, $longitude, $recordedAt);

                if ($shouldPersist) {
                    $this->createLocationPoint(
                        session: $session,
                        task: $task,
                        user: $user,
                        latitude: $latitude,
                        longitude: $longitude,
                        recordedAt: $recordedAt,
                        eventType: $eventType,
                        isCheckpoint: $isCheckpoint,
                        accuracyMeters: $accuracy,
                        speedMps: $speed,
                        headingDegrees: $heading,
                    );

                    $persistedCount++;
                    $session->last_persisted_latitude = $latitude;
                    $session->last_persisted_longitude = $longitude;
                    $session->last_persisted_recorded_at = $recordedAt;
                }

                $payload = [
                    'task_status' => $task->status?->value,
                    'latitude' => $latitude,
                    'longitude' => $longitude,
                    'accuracy_meters' => $accuracy,
                    'speed_mps' => $speed,
                    'heading_degrees' => $heading,
                    'arrived' => $session->arrival_detected_at !== null,
                    'event_type' => $eventType,
                ];

                $this->publishTrackingEvent('tracking.location.updated', $session->company_id, $task->id, $session->id, $user->id, $payload, $recordedAt);

                if ($justArrived) {
                    $this->publishTrackingEvent('tracking.task.arrived', $session->company_id, $task->id, $session->id, $user->id, $payload, $recordedAt);
                }
            }

            $session->save();
        });

        return [
            'task' => $this->loadTaskForResponse($task),
            'session' => $session->fresh(),
            'received_points' => $points->count(),
            'persisted_points' => $persistedCount,
            'arrived' => $session->fresh()->arrival_detected_at !== null,
        ];
    }

    public function complete(User $user, Task $task, array $data): array
    {
        $context = $this->accessService->resolve($user, $data['company_id'] ?? null);
        $this->accessService->ensureAgent($context);
        $this->assertTaskInCompany($task, $context->company->id);
        $this->ensureAssignedUser($task, $user);

        if ($task->status?->value !== TaskStatus::IN_PROGRESS->value) {
            throw ValidationException::withMessages([
                'task' => ['Task must be in progress before completion.'],
            ]);
        }

        $session = TaskTrackingSession::query()
            ->where('task_id', $task->id)
            ->whereNull('end_recorded_at')
            ->first();

        if (! $session) {
            throw ValidationException::withMessages([
                'tracking' => ['Tracking session is not active for this task.'],
            ]);
        }

        $latitude = (float) $data['latitude'];
        $longitude = (float) $data['longitude'];
        $accuracy = array_key_exists('accuracy_meters', $data) && $data['accuracy_meters'] !== null
            ? (float) $data['accuracy_meters']
            : null;
        $recordedAt = isset($data['recorded_at']) ? Carbon::parse((string) $data['recorded_at']) : now();

        return DB::transaction(function () use ($user, $task, $context, $session, $data, $latitude, $longitude, $accuracy, $recordedAt): array {
            $proofs = [];
            foreach ($data['files'] as $file) {
                if (! $file instanceof UploadedFile) {
                    continue;
                }

                $proofs[] = $this->taskService->uploadProof(
                    user: $user,
                    task: $task,
                    file: $file,
                    data: [
                        'company_id' => $context->company->id,
                        'latitude' => $latitude,
                        'longitude' => $longitude,
                        'captured_at' => $recordedAt,
                        'notes' => $data['notes'] ?? null,
                    ],
                );
            }

            $updatedTask = $this->taskService->updateStatus(
                user: $user,
                task: $task,
                status: TaskStatus::COMPLETED->value,
                companyId: $context->company->id,
            );

            if ($session->arrival_detected_at === null && $this->shouldMarkArrival($session, $latitude, $longitude)) {
                $session->arrival_detected_at = $recordedAt;
                $session->arrival_latitude = $latitude;
                $session->arrival_longitude = $longitude;
            }

            $session->completed_by_user_id = $user->id;
            $session->end_latitude = $latitude;
            $session->end_longitude = $longitude;
            $session->end_accuracy_meters = $accuracy;
            $session->end_recorded_at = $recordedAt;
            $session->last_latitude = $latitude;
            $session->last_longitude = $longitude;
            $session->last_accuracy_meters = $accuracy;
            $session->last_recorded_at = $recordedAt;
            $session->last_persisted_latitude = $latitude;
            $session->last_persisted_longitude = $longitude;
            $session->last_persisted_recorded_at = $recordedAt;
            $session->save();

            $this->createLocationPoint(
                session: $session,
                task: $task,
                user: $user,
                latitude: $latitude,
                longitude: $longitude,
                recordedAt: $recordedAt,
                eventType: 'complete',
                isCheckpoint: true,
                accuracyMeters: $accuracy,
                speedMps: null,
                headingDegrees: null,
            );

            $payload = [
                'task_status' => TaskStatus::COMPLETED->value,
                'latitude' => $latitude,
                'longitude' => $longitude,
                'accuracy_meters' => $accuracy,
                'proofs_uploaded' => count($proofs),
                'arrived' => $session->arrival_detected_at !== null,
                'event_type' => 'complete',
            ];

            $this->publishTrackingEvent('tracking.location.updated', $context->company->id, $task->id, $session->id, $user->id, $payload, $recordedAt);
            $this->publishTrackingEvent('tracking.task.completed', $context->company->id, $task->id, $session->id, $user->id, $payload, $recordedAt);

            return [
                'task' => $this->loadTaskForResponse($updatedTask),
                'session' => $session->fresh(),
                'proofs' => $proofs,
            ];
        });
    }

    public function routeForUser(User $user, Task $task, array $filters): array
    {
        $context = $this->accessService->resolve($user, $filters['company_id'] ?? null);
        $this->assertTaskInCompany($task, $context->company->id);

        if (! $context->canManageTasks()) {
            $this->ensureAssignedUser($task, $user);
        }

        $session = TaskTrackingSession::query()
            ->with(['points' => function ($query) use ($filters): void {
                $query->orderBy('recorded_at', 'asc');

                if (isset($filters['limit']) && is_int($filters['limit'])) {
                    $query->limit($filters['limit']);
                }
            }])
            ->where('task_id', $task->id)
            ->first();

        if (! $session) {
            throw ValidationException::withMessages([
                'tracking' => ['No tracking data available for this task.'],
            ]);
        }

        $includePoints = (bool) ($filters['include_points'] ?? true);
        $points = $session->points;

        return [
            'task_id' => $task->id,
            'company_id' => $task->company_id,
            'status' => $task->status?->value,
            'destination' => [
                'latitude' => $session->destination_latitude,
                'longitude' => $session->destination_longitude,
                'radius_meters' => $session->destination_radius_meters,
            ],
            'start' => [
                'latitude' => $session->start_latitude,
                'longitude' => $session->start_longitude,
                'recorded_at' => $session->start_recorded_at?->toIso8601String(),
            ],
            'arrival' => [
                'latitude' => $session->arrival_latitude,
                'longitude' => $session->arrival_longitude,
                'recorded_at' => $session->arrival_detected_at?->toIso8601String(),
            ],
            'end' => [
                'latitude' => $session->end_latitude,
                'longitude' => $session->end_longitude,
                'recorded_at' => $session->end_recorded_at?->toIso8601String(),
            ],
            'summary' => [
                'points_count' => $points->count(),
                'total_distance_meters' => round($this->calculateTotalDistanceMeters($points), 2),
            ],
            'points' => $includePoints
                ? $points->map(fn(TaskLocationPoint $point): array => [
                    'latitude' => $point->latitude,
                    'longitude' => $point->longitude,
                    'accuracy_meters' => $point->accuracy_meters,
                    'speed_mps' => $point->speed_mps,
                    'heading_degrees' => $point->heading_degrees,
                    'event_type' => $point->event_type,
                    'is_checkpoint' => $point->is_checkpoint,
                    'recorded_at' => $point->recorded_at?->toIso8601String(),
                ])->values()->all()
                : [],
            'polyline' => $includePoints
                ? $points->map(fn(TaskLocationPoint $point): array => [$point->longitude, $point->latitude])->values()->all()
                : [],
        ];
    }

    private function normalizeIncomingPoints(array $data): Collection
    {
        if (! empty($data['points']) && is_array($data['points'])) {
            return collect($data['points'])
                ->map(fn(array $point): array => [
                    'latitude' => $point['latitude'],
                    'longitude' => $point['longitude'],
                    'accuracy_meters' => $point['accuracy_meters'] ?? null,
                    'speed_mps' => $point['speed_mps'] ?? null,
                    'heading_degrees' => $point['heading_degrees'] ?? null,
                    'recorded_at' => $point['recorded_at'] ?? null,
                ])
                ->values();
        }

        return collect([[
            'latitude' => $data['latitude'],
            'longitude' => $data['longitude'],
            'accuracy_meters' => $data['accuracy_meters'] ?? null,
            'speed_mps' => $data['speed_mps'] ?? null,
            'heading_degrees' => $data['heading_degrees'] ?? null,
            'recorded_at' => $data['recorded_at'] ?? null,
        ]]);
    }

    private function shouldPersistMovementPoint(TaskTrackingSession $session, float $latitude, float $longitude, Carbon $recordedAt): bool
    {
        if (! $session->last_persisted_recorded_at || $session->last_persisted_latitude === null || $session->last_persisted_longitude === null) {
            return true;
        }

        $minSeconds = max(1, (int) config('tracking.persist_min_interval_seconds', 15));
        $secondsDiff = abs($session->last_persisted_recorded_at->diffInSeconds($recordedAt));

        if ($secondsDiff >= $minSeconds) {
            return true;
        }

        $minDistance = max(1.0, (float) config('tracking.persist_min_distance_meters', 20));
        $distance = $this->distanceMeters(
            (float) $session->last_persisted_latitude,
            (float) $session->last_persisted_longitude,
            $latitude,
            $longitude,
        );

        return $distance >= $minDistance;
    }

    private function shouldMarkArrival(TaskTrackingSession $session, float $latitude, float $longitude): bool
    {
        if ($session->arrival_detected_at !== null) {
            return false;
        }

        if ($session->destination_latitude === null || $session->destination_longitude === null) {
            return false;
        }

        $distance = $this->distanceMeters(
            (float) $session->destination_latitude,
            (float) $session->destination_longitude,
            $latitude,
            $longitude,
        );

        return $distance <= (float) $session->destination_radius_meters;
    }

    private function markArrivalIfWithinRadius(
        TaskTrackingSession $session,
        Task $task,
        User $user,
        float $latitude,
        float $longitude,
        Carbon $recordedAt,
        ?float $accuracy,
    ): bool {
        if (! $this->shouldMarkArrival($session, $latitude, $longitude)) {
            return false;
        }

        $session->arrival_detected_at = $recordedAt;
        $session->arrival_latitude = $latitude;
        $session->arrival_longitude = $longitude;
        $session->save();

        $this->createLocationPoint(
            session: $session,
            task: $task,
            user: $user,
            latitude: $latitude,
            longitude: $longitude,
            recordedAt: $recordedAt,
            eventType: 'arrival',
            isCheckpoint: true,
            accuracyMeters: $accuracy,
            speedMps: null,
            headingDegrees: null,
        );

        return true;
    }

    private function createLocationPoint(
        TaskTrackingSession $session,
        Task $task,
        User $user,
        float $latitude,
        float $longitude,
        Carbon $recordedAt,
        string $eventType,
        bool $isCheckpoint,
        ?float $accuracyMeters,
        ?float $speedMps,
        ?float $headingDegrees,
    ): TaskLocationPoint {
        return TaskLocationPoint::query()->create([
            'tracking_session_id' => $session->id,
            'task_id' => $task->id,
            'company_id' => $session->company_id,
            'user_id' => $user->id,
            'latitude' => $latitude,
            'longitude' => $longitude,
            'accuracy_meters' => $accuracyMeters,
            'speed_mps' => $speedMps,
            'heading_degrees' => $headingDegrees,
            'event_type' => $eventType,
            'is_checkpoint' => $isCheckpoint,
            'recorded_at' => $recordedAt,
        ]);
    }

    private function loadTaskForResponse(Task $task): Task
    {
        return Task::query()
            ->with(['project', 'creator', 'assignedAgent', 'currentAssignees', 'proofs'])
            ->findOrFail($task->id);
    }

    private function ensureAssignedUser(Task $task, User $user): void
    {
        $isPrimaryAssignee = (int) $task->assigned_agent_id === (int) $user->id;

        $isCurrentAssignee = DB::table('task_assignments')
            ->where('task_id', $task->id)
            ->where('assigned_agent_id', $user->id)
            ->where('is_current', true)
            ->exists();

        if (! $isPrimaryAssignee && ! $isCurrentAssignee) {
            throw ValidationException::withMessages([
                'authorization' => ['You can only track tasks currently assigned to you.'],
            ]);
        }
    }

    private function assertTaskInCompany(Task $task, int $companyId): void
    {
        if ((int) $task->company_id !== $companyId) {
            throw ValidationException::withMessages([
                'task' => ['Task does not belong to the active company context.'],
            ]);
        }
    }

    private function isTerminalStatus(?string $status): bool
    {
        return in_array($status, [TaskStatus::COMPLETED->value, TaskStatus::CANCELLED->value], true);
    }

    /**
     * Haversine distance in meters.
     */
    private function distanceMeters(float $fromLat, float $fromLng, float $toLat, float $toLng): float
    {
        $earthRadius = 6371000.0;

        $deltaLat = deg2rad($toLat - $fromLat);
        $deltaLng = deg2rad($toLng - $fromLng);

        $a = sin($deltaLat / 2) ** 2
            + cos(deg2rad($fromLat))
            * cos(deg2rad($toLat))
            * sin($deltaLng / 2) ** 2;

        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));

        return $earthRadius * $c;
    }

    private function calculateTotalDistanceMeters(Collection $points): float
    {
        if ($points->count() < 2) {
            return 0.0;
        }

        $distance = 0.0;
        $previous = null;

        foreach ($points as $point) {
            if (! $point instanceof TaskLocationPoint) {
                continue;
            }

            if ($previous instanceof TaskLocationPoint) {
                $distance += $this->distanceMeters(
                    (float) $previous->latitude,
                    (float) $previous->longitude,
                    (float) $point->latitude,
                    (float) $point->longitude,
                );
            }

            $previous = $point;
        }

        return $distance;
    }

    private function publishTrackingEvent(
        string $event,
        int $companyId,
        int $taskId,
        int $trackingSessionId,
        int $userId,
        array $data,
        Carbon $occurredAt,
    ): void {
        $prefix = rtrim((string) config('tracking.redis_channel_prefix', 'factory23.tracking'), '.');

        $payload = [
            'event' => $event,
            'version' => 1,
            'company_id' => $companyId,
            'task_id' => $taskId,
            'tracking_session_id' => $trackingSessionId,
            'user_id' => $userId,
            'occurred_at' => $occurredAt->toIso8601String(),
            'data' => $data,
        ];

        $channels = [
            "{$prefix}.company.{$companyId}",
            "{$prefix}.task.{$taskId}",
        ];

        try {
            foreach ($channels as $channel) {
                Redis::publish($channel, json_encode($payload, JSON_THROW_ON_ERROR));
            }
        } catch (Throwable $e) {
            Log::warning('Failed to publish tracking event to Redis.', [
                'event' => $event,
                'company_id' => $companyId,
                'task_id' => $taskId,
                'tracking_session_id' => $trackingSessionId,
                'exception' => $e::class,
                'message' => $e->getMessage(),
            ]);
        }
    }
}
