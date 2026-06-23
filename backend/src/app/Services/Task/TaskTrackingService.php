<?php

declare(strict_types=1);

namespace App\Services\Task;

use App\Enums\NotificationCategory;
use App\Enums\NotificationPriority;
use App\Enums\TaskStatus;
use App\Models\Task;
use App\Models\TaskLocationPoint;
use App\Models\TaskProof;
use App\Models\TaskTrackingSession;
use App\Models\User;
use App\Services\Notification\NotificationService;
use App\Services\Tracking\AgentLocationSnapshotService;
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
        private readonly AgentLocationSnapshotService $agentLocationSnapshotService,
        private readonly NotificationService $notificationService,
    ) {}

    public function start(User $user, Task $task, array $data): array
    {
        $context = $this->accessService->resolve($user, $data['company_id'] ?? null);
        $this->accessService->ensureAgent($context);
        $this->assertTaskInCompany($task, $context->company->id);
        $this->ensureAssignedUser($task, $user);

        if (! $task->hasTrackableLocation()) {
            throw ValidationException::withMessages([
                'task' => ['This task has no destination location. Update its status from the task details instead of using map tracking.'],
            ]);
        }

        if (! (bool) ($data['location_permission_granted'] ?? false)) {
            Log::warning('[tracking] location_permission_denied', [
                'source' => 'TaskTrackingService',
                'task_id' => $task->id,
                'user_id' => $user->id,
                'reason' => 'Client reported location_permission_granted = false.',
                'suggested_fix' => 'Prompt the agent to enable location access, then retry start.',
            ]);

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
        $speed = array_key_exists('speed_mps', $data) && $data['speed_mps'] !== null
            ? (float) $data['speed_mps']
            : null;
        $heading = array_key_exists('heading_degrees', $data) && $data['heading_degrees'] !== null
            ? (float) $data['heading_degrees']
            : null;

        return DB::transaction(function () use ($user, $task, $context, $latitude, $longitude, $accuracy, $speed, $heading, $recordedAt): array {
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
                'destination_radius_meters' => (int) config('tracking.arrival_radius_meters', 100),
            ]);

            // Evaluate the geofence at start so an agent who begins a task while
            // already standing at (or near) the destination is recognised
            // immediately instead of being stuck unable to reach "arrived".
            $startGeofence = $this->evaluateStartGeofence(
                session: $session,
                latitude: $latitude,
                longitude: $longitude,
                accuracyMeters: $accuracy,
                recordedAt: $recordedAt,
            );
            $arrived = $startGeofence['arrived'];
            $nearDestination = $startGeofence['near'] && ! $arrived;

            if ($arrived || $startGeofence['near']) {
                $session->save();
            }

            $startEventType = $arrived ? 'arrival' : ($nearDestination ? 'near_destination' : 'start');

            $this->createLocationPoint(
                session: $session,
                task: $task,
                user: $user,
                latitude: $latitude,
                longitude: $longitude,
                recordedAt: $recordedAt,
                eventType: $startEventType,
                isCheckpoint: true,
                accuracyMeters: $accuracy,
                speedMps: $speed,
                headingDegrees: $heading,
            );

            $proximity = $this->buildProximitySnapshot(
                session: $session,
                latitude: $latitude,
                longitude: $longitude,
                accuracyMeters: $accuracy,
            );

            $payload = $this->upsertSnapshotAndBuildRealtimePayload(
                session: $session,
                task: $task,
                userId: $user->id,
                latitude: $latitude,
                longitude: $longitude,
                accuracyMeters: $accuracy,
                speedMps: $speed,
                headingDegrees: $heading,
                eventType: $startEventType,
                taskStatus: $task->status?->value,
                arrived: $arrived,
                nearDestination: $nearDestination,
                movementStarted: $proximity['movement_started'],
                distanceToDestinationMeters: $proximity['distance_to_destination_meters'],
                distanceRemainingMeters: $proximity['distance_remaining_meters'],
                proximityState: $this->resolveProximityState($session, $task->status?->value),
                recordedAt: $recordedAt,
            );

            $this->publishTrackingEvent('tracking.task.started', $context->company->id, $task->id, $session->id, $user->id, $payload, $recordedAt);
            $this->publishTrackingEvent('tracking.location.updated', $context->company->id, $task->id, $session->id, $user->id, $payload, $recordedAt);
            $this->publishTrackingEvent('tracking.agent.location.updated', $context->company->id, $task->id, $session->id, $user->id, $payload, $recordedAt);

            $this->notifyTrackingEvent(
                task: $task,
                actor: $user,
                type: 'tracking.task.started',
                title: 'Task tracking started',
                message: "{$user->name} started tracking for task '{$task->title}'.",
                priority: NotificationPriority::NORMAL->value,
            );

            if ($nearDestination) {
                $this->publishTrackingEvent('tracking.task.near_destination', $context->company->id, $task->id, $session->id, $user->id, $payload, $recordedAt);
                $this->notifyTrackingEvent(
                    task: $task,
                    actor: $user,
                    type: 'tracking.task.near_destination',
                    title: 'Agent near destination',
                    message: "{$user->name} is near destination for task '{$task->title}'.",
                    priority: NotificationPriority::HIGH->value,
                );
            }

            if ($arrived) {
                $this->publishTrackingEvent('tracking.task.arrived', $context->company->id, $task->id, $session->id, $user->id, $payload, $recordedAt);
                $this->notifyTrackingEvent(
                    task: $task,
                    actor: $user,
                    type: 'tracking.task.arrived',
                    title: 'Agent arrived on site',
                    message: "{$user->name} arrived at task '{$task->title}'.",
                    priority: NotificationPriority::HIGH->value,
                );
            }

            $this->logLifecycle('task_started', [
                'task_id' => $task->id,
                'tracking_session_id' => $session->id,
                'user_id' => $user->id,
                'arrived_at_start' => $arrived,
                'near_at_start' => $nearDestination,
                'distance_to_destination_meters' => $proximity['distance_to_destination_meters'],
            ]);

            return [
                'task' => $this->loadTaskForResponse($task),
                'session' => $session->fresh(),
                'arrived' => $arrived,
                'near_destination' => $nearDestination,
                'proximity_state' => $this->resolveProximityState($session, $task->status?->value),
                'distance_to_destination_meters' => $proximity['distance_to_destination_meters'] !== null
                    ? round($proximity['distance_to_destination_meters'], 2)
                    : null,
                'distance_remaining_meters' => $proximity['distance_remaining_meters'] !== null
                    ? round($proximity['distance_remaining_meters'], 2)
                    : null,
                'movement_started' => $proximity['movement_started'],
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
        $lastDistanceToDestinationMeters = null;
        $lastDistanceRemainingMeters = null;
        $movementStarted = false;

        DB::transaction(function () use ($points, $session, $task, $user, &$persistedCount, &$lastDistanceToDestinationMeters, &$lastDistanceRemainingMeters, &$movementStarted): void {
            foreach ($points as $point) {
                $latitude = (float) $point['latitude'];
                $longitude = (float) $point['longitude'];
                $accuracy = isset($point['accuracy_meters']) ? (float) $point['accuracy_meters'] : null;
                $accuracyForProximity = $accuracy ?? ($session->last_accuracy_meters !== null
                    ? (float) $session->last_accuracy_meters
                    : null);
                $speed = isset($point['speed_mps']) ? (float) $point['speed_mps'] : null;
                $heading = isset($point['heading_degrees']) ? (float) $point['heading_degrees'] : null;
                $recordedAt = isset($point['recorded_at']) ? Carbon::parse((string) $point['recorded_at']) : now();

                $proximity = $this->buildProximitySnapshot(
                    session: $session,
                    latitude: $latitude,
                    longitude: $longitude,
                    accuracyMeters: $accuracyForProximity,
                );

                $lastDistanceToDestinationMeters = $proximity['distance_to_destination_meters'];
                $lastDistanceRemainingMeters = $proximity['distance_remaining_meters'];
                $movementStarted = $proximity['movement_started'];

                $session->last_latitude = $latitude;
                $session->last_longitude = $longitude;
                $session->last_accuracy_meters = $accuracy;
                $session->last_recorded_at = $recordedAt;

                $eventType = 'movement';
                $isCheckpoint = false;

                $justNearDestination = false;
                $justArrived = false;

                // If an agent that reached "near" (but not "arrived") moves well
                // back outside the near radius, reset the near state so a fresh
                // near notification can fire if they approach again.
                if (
                    $session->arrival_detected_at === null
                    && $session->near_detected_at !== null
                    && $proximity['distance_to_destination_meters'] !== null
                    && $proximity['distance_to_destination_meters']
                        > $proximity['near_radius_meters'] * (float) config('tracking.near_reset_hysteresis', 1.5)
                ) {
                    $session->near_detected_at = null;
                    $session->near_latitude = null;
                    $session->near_longitude = null;
                }

                if ($session->arrival_detected_at === null) {
                    if ($session->near_detected_at === null && $proximity['can_mark_near']) {
                        $justNearDestination = true;
                        $eventType = 'near_destination';
                        $isCheckpoint = true;

                        $session->near_detected_at = $recordedAt;
                        $session->near_latitude = $latitude;
                        $session->near_longitude = $longitude;
                    } elseif (
                        $session->near_detected_at !== null
                        && $proximity['can_mark_arrival']
                        && $this->hasSatisfiedNearDwellTime($session, $recordedAt)
                    ) {
                        $justArrived = true;
                        $eventType = 'arrival';
                        $isCheckpoint = true;

                        $session->arrival_detected_at = $recordedAt;
                        $session->arrival_latitude = $latitude;
                        $session->arrival_longitude = $longitude;
                    }
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

                $arrived = $session->arrival_detected_at !== null;
                $nearDestination = $session->near_detected_at !== null && ! $arrived;

                $payload = $this->upsertSnapshotAndBuildRealtimePayload(
                    session: $session,
                    task: $task,
                    userId: $user->id,
                    latitude: $latitude,
                    longitude: $longitude,
                    accuracyMeters: $accuracyForProximity,
                    speedMps: $speed,
                    headingDegrees: $heading,
                    eventType: $eventType,
                    taskStatus: $task->status?->value,
                    arrived: $arrived,
                    nearDestination: $nearDestination,
                    movementStarted: $proximity['movement_started'],
                    distanceToDestinationMeters: $proximity['distance_to_destination_meters'],
                    distanceRemainingMeters: $proximity['distance_remaining_meters'],
                    proximityState: $this->resolveProximityState($session, $task->status?->value),
                    recordedAt: $recordedAt,
                );

                $this->publishTrackingEvent('tracking.location.updated', $session->company_id, $task->id, $session->id, $user->id, $payload, $recordedAt);
                $this->publishTrackingEvent('tracking.agent.location.updated', $session->company_id, $task->id, $session->id, $user->id, $payload, $recordedAt);

                if ($justNearDestination) {
                    $this->logLifecycle('near_destination', [
                        'task_id' => $task->id,
                        'tracking_session_id' => $session->id,
                        'user_id' => $user->id,
                        'distance_to_destination_meters' => $proximity['distance_to_destination_meters'],
                    ]);

                    $this->publishTrackingEvent('tracking.task.near_destination', $session->company_id, $task->id, $session->id, $user->id, $payload, $recordedAt);

                    $this->notifyTrackingEvent(
                        task: $task,
                        actor: $user,
                        type: 'tracking.task.near_destination',
                        title: 'Agent near destination',
                        message: "{$user->name} is near destination for task '{$task->title}'.",
                        priority: NotificationPriority::HIGH->value,
                    );
                }

                if ($justArrived) {
                    $this->logLifecycle('arrived', [
                        'task_id' => $task->id,
                        'tracking_session_id' => $session->id,
                        'user_id' => $user->id,
                        'distance_to_destination_meters' => $proximity['distance_to_destination_meters'],
                    ]);

                    $this->publishTrackingEvent('tracking.task.arrived', $session->company_id, $task->id, $session->id, $user->id, $payload, $recordedAt);

                    $this->notifyTrackingEvent(
                        task: $task,
                        actor: $user,
                        type: 'tracking.task.arrived',
                        title: 'Agent arrived on site',
                        message: "{$user->name} arrived at task '{$task->title}'.",
                        priority: NotificationPriority::HIGH->value,
                    );
                }
            }

            $session->save();
        });

        $freshSession = $session->fresh();
        $arrived = $freshSession->arrival_detected_at !== null;
        $nearDestination = $freshSession->near_detected_at !== null && ! $arrived;

        return [
            'task' => $this->loadTaskForResponse($task),
            'session' => $freshSession,
            'received_points' => $points->count(),
            'persisted_points' => $persistedCount,
            'arrived' => $arrived,
            'near_destination' => $nearDestination,
            'proximity_state' => $this->resolveProximityState($freshSession, $task->status?->value),
            'distance_to_destination_meters' => $lastDistanceToDestinationMeters !== null
                ? round($lastDistanceToDestinationMeters, 2)
                : null,
            'distance_remaining_meters' => $lastDistanceRemainingMeters !== null
                ? round($lastDistanceRemainingMeters, 2)
                : null,
            'movement_started' => $movementStarted,
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

        if ($session->arrival_detected_at === null) {
            throw ValidationException::withMessages([
                'task' => ['Task must be marked as arrived before completion.'],
            ]);
        }

        $latitude = (float) $data['latitude'];
        $longitude = (float) $data['longitude'];
        $accuracy = array_key_exists('accuracy_meters', $data) && $data['accuracy_meters'] !== null
            ? (float) $data['accuracy_meters']
            : null;
        $accuracyForProximity = $accuracy ?? ($session->last_accuracy_meters !== null
            ? (float) $session->last_accuracy_meters
            : null);
        $recordedAt = isset($data['recorded_at']) ? Carbon::parse((string) $data['recorded_at']) : now();

        return DB::transaction(function () use ($user, $task, $context, $session, $data, $latitude, $longitude, $accuracy, $accuracyForProximity, $recordedAt): array {
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

            $proximity = $this->buildProximitySnapshot(
                session: $session,
                latitude: $latitude,
                longitude: $longitude,
                accuracyMeters: $accuracyForProximity,
            );

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

            $payload = $this->upsertSnapshotAndBuildRealtimePayload(
                session: $session,
                task: $task,
                userId: $user->id,
                latitude: $latitude,
                longitude: $longitude,
                accuracyMeters: $accuracyForProximity,
                speedMps: null,
                headingDegrees: null,
                eventType: 'complete',
                taskStatus: TaskStatus::COMPLETED->value,
                arrived: true,
                nearDestination: false,
                movementStarted: $proximity['movement_started'],
                distanceToDestinationMeters: $proximity['distance_to_destination_meters'],
                distanceRemainingMeters: $proximity['distance_remaining_meters'],
                proximityState: 'completed',
                recordedAt: $recordedAt,
            );
            $payload['proofs_uploaded'] = count($proofs);

            $this->publishTrackingEvent('tracking.location.updated', $context->company->id, $task->id, $session->id, $user->id, $payload, $recordedAt);
            $this->publishTrackingEvent('tracking.agent.location.updated', $context->company->id, $task->id, $session->id, $user->id, $payload, $recordedAt);
            $this->publishTrackingEvent('tracking.task.completed', $context->company->id, $task->id, $session->id, $user->id, $payload, $recordedAt);

            $this->logLifecycle('task_completed', [
                'task_id' => $task->id,
                'tracking_session_id' => $session->id,
                'user_id' => $user->id,
                'proofs_uploaded' => count($proofs),
            ]);

            $this->notifyTrackingEvent(
                task: $task,
                actor: $user,
                type: 'tracking.task.completed',
                title: 'Task tracking completed',
                message: "{$user->name} completed task '{$task->title}'.",
                priority: NotificationPriority::HIGH->value,
            );

            return [
                'task' => $this->loadTaskForResponse($updatedTask),
                'session' => $session->fresh(),
                'proofs' => $proofs,
            ];
        });
    }

    /**
     * Keep tracking state consistent when a task's status changes outside the
     * tracking complete() flow (e.g. PATCH /tasks/{id}/status to paused,
     * cancelled or completed). Closes the active session and broadcasts a
     * tracking.task.completed event so the live map stops showing the agent.
     *
     * Safe to call for any status: it is a no-op unless the status stops tracking
     * and an active session exists. It does NOT call TaskService::updateStatus
     * (the caller already did), avoiding a circular dependency and double work.
     */
    public function stopTrackingForStatusChange(Task $task, User $actor, string $status): void
    {
        $stopStatuses = [
            TaskStatus::PAUSED->value,
            TaskStatus::CANCELLED->value,
            TaskStatus::COMPLETED->value,
        ];

        if (! in_array($status, $stopStatuses, true)) {
            return;
        }

        $session = TaskTrackingSession::query()
            ->where('task_id', $task->id)
            ->whereNull('end_recorded_at')
            ->orderByDesc('id')
            ->first();

        if (! $session) {
            return;
        }

        DB::transaction(function () use ($task, $actor, $session): void {
            $recordedAt = now();
            $latitude = $session->last_latitude !== null
                ? (float) $session->last_latitude
                : (float) $session->start_latitude;
            $longitude = $session->last_longitude !== null
                ? (float) $session->last_longitude
                : (float) $session->start_longitude;
            $accuracy = $session->last_accuracy_meters !== null
                ? (float) $session->last_accuracy_meters
                : null;

            $session->completed_by_user_id = $actor->id;
            $session->end_latitude = $latitude;
            $session->end_longitude = $longitude;
            $session->end_accuracy_meters = $accuracy;
            $session->end_recorded_at = $session->last_recorded_at ?? $recordedAt;
            $session->save();

            $this->createLocationPoint(
                session: $session,
                task: $task,
                user: $actor,
                latitude: $latitude,
                longitude: $longitude,
                recordedAt: $recordedAt,
                eventType: 'complete',
                isCheckpoint: true,
                accuracyMeters: $accuracy,
                speedMps: null,
                headingDegrees: null,
            );

            $proximity = $this->buildProximitySnapshot(
                session: $session,
                latitude: $latitude,
                longitude: $longitude,
                accuracyMeters: $accuracy,
            );

            $payload = $this->upsertSnapshotAndBuildRealtimePayload(
                session: $session,
                task: $task,
                userId: $actor->id,
                latitude: $latitude,
                longitude: $longitude,
                accuracyMeters: $accuracy,
                speedMps: null,
                headingDegrees: null,
                eventType: 'complete',
                taskStatus: $task->status?->value,
                arrived: $session->arrival_detected_at !== null,
                nearDestination: false,
                movementStarted: $proximity['movement_started'],
                distanceToDestinationMeters: $proximity['distance_to_destination_meters'],
                distanceRemainingMeters: $proximity['distance_remaining_meters'],
                proximityState: 'completed',
                recordedAt: $recordedAt,
            );

            // Clients treat tracking.task.completed as "tracking stopped" and
            // remove the agent from the live map. Resuming a paused task starts a
            // fresh session and re-broadcasts tracking.task.started.
            $this->publishTrackingEvent('tracking.location.updated', (int) $session->company_id, $task->id, $session->id, $actor->id, $payload, $recordedAt);
            $this->publishTrackingEvent('tracking.agent.location.updated', (int) $session->company_id, $task->id, $session->id, $actor->id, $payload, $recordedAt);
            $this->publishTrackingEvent('tracking.task.completed', (int) $session->company_id, $task->id, $session->id, $actor->id, $payload, $recordedAt);

            $this->logLifecycle('tracking_stopped_by_status_change', [
                'task_id' => $task->id,
                'tracking_session_id' => $session->id,
                'user_id' => $actor->id,
                'new_status' => $task->status?->value,
            ]);
        });
    }

    public function routeForUser(User $user, Task $task, array $filters): array
    {
        $context = $this->accessService->resolve($user, $filters['company_id'] ?? null);
        $this->assertTaskInCompany($task, $context->company->id);

        if (! $context->canManageTasks()) {
            $this->ensureAssignedUser($task, $user);
        }

        if (! $task->hasTrackableLocation()) {
            throw ValidationException::withMessages([
                'task' => ['Map route data is only available for tasks with a destination location.'],
            ]);
        }

        $session = TaskTrackingSession::query()
            ->with(['points' => function ($query) use ($filters): void {
                $query->orderBy('recorded_at', 'asc');

                if (isset($filters['limit']) && is_int($filters['limit'])) {
                    $query->limit($filters['limit']);
                }
            }])
            ->where('task_id', $task->id)
            // A task may have multiple sessions; show the most recent (the active
            // one if tracking is live, otherwise the last completed session).
            ->orderByDesc('id')
            ->first();

        if (! $session) {
            throw ValidationException::withMessages([
                'tracking' => ['No tracking data available for this task.'],
            ]);
        }

        $includePoints = (bool) ($filters['include_points'] ?? true);
        $points = $session->points;
        $lastSpeedMps = $points->last()?->speed_mps;
        $distanceToDestination = $session->last_latitude !== null && $session->last_longitude !== null
            ? $this->calculateDistanceToDestination(
                session: $session,
                latitude: (float) $session->last_latitude,
                longitude: (float) $session->last_longitude,
            )
            : null;
        $distanceRemaining = $session->last_latitude !== null && $session->last_longitude !== null
            ? $this->calculateDistanceRemainingToArrival(
                session: $session,
                latitude: (float) $session->last_latitude,
                longitude: (float) $session->last_longitude,
            )
            : null;
        $etaSeconds = $this->estimateEtaSeconds($distanceRemaining, $lastSpeedMps !== null ? (float) $lastSpeedMps : null);
        $routeDeviationMeters = $session->last_latitude !== null && $session->last_longitude !== null
            ? $this->calculateRouteDeviationMeters(
                session: $session,
                latitude: (float) $session->last_latitude,
                longitude: (float) $session->last_longitude,
            )
            : null;
        $operationalStatus = $this->resolveOperationalStatus(
            task: $task,
            proximityState: $this->resolveProximityState($session, $task->status?->value),
            movementStarted: $session->last_latitude !== null && $session->last_longitude !== null
                ? $this->distanceFromSessionStart($session, (float) $session->last_latitude, (float) $session->last_longitude)
                >= max(1.0, (float) config('tracking.min_movement_before_proximity_meters', 20))
                : false,
            isOnline: true,
            etaSeconds: $etaSeconds,
        );

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
            'near' => $session->near_detected_at
                ? [
                    'latitude' => $session->near_latitude,
                    'longitude' => $session->near_longitude,
                    'recorded_at' => $session->near_detected_at?->toIso8601String(),
                ]
                : null,
            'arrival' => $session->arrival_detected_at
                ? [
                    'latitude' => $session->arrival_latitude,
                    'longitude' => $session->arrival_longitude,
                    'recorded_at' => $session->arrival_detected_at?->toIso8601String(),
                ]
                : null,
            'end' => $session->end_recorded_at
                ? [
                    'latitude' => $session->end_latitude,
                    'longitude' => $session->end_longitude,
                    'recorded_at' => $session->end_recorded_at?->toIso8601String(),
                ]
                : null,
            'proximity' => [
                'state' => $this->resolveProximityState($session, $task->status?->value),
                'distance_to_destination_meters' => $distanceToDestination !== null ? round($distanceToDestination, 2) : null,
                'distance_remaining_meters' => $distanceRemaining !== null ? round($distanceRemaining, 2) : null,
                'speed_mps' => $lastSpeedMps !== null ? round((float) $lastSpeedMps, 3) : null,
                'eta_seconds' => $etaSeconds,
                'route_deviation_meters' => $routeDeviationMeters !== null ? round($routeDeviationMeters, 2) : null,
                'operational_status' => $operationalStatus,
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

    private function buildProximitySnapshot(
        TaskTrackingSession $session,
        float $latitude,
        float $longitude,
        ?float $accuracyMeters,
    ): array {
        $distanceToDestination = $this->calculateDistanceToDestination($session, $latitude, $longitude);
        $distanceRemaining = $this->calculateDistanceRemainingToArrival($session, $latitude, $longitude);

        $movementFromStartMeters = $this->distanceFromSessionStart($session, $latitude, $longitude);
        $minMovementBeforeProximity = max(1.0, (float) config('tracking.min_movement_before_proximity_meters', 20));
        $movementStarted = $movementFromStartMeters >= $minMovementBeforeProximity;

        $arrivalRadiusMeters = max(1.0, (float) ($session->destination_radius_meters ?? config('tracking.arrival_radius_meters', 100)));
        $nearRadiusMeters = max(
            $arrivalRadiusMeters + 1,
            (float) config('tracking.near_radius_meters', 250),
        );

        $isWithinNear = $distanceToDestination !== null && $distanceToDestination <= $nearRadiusMeters;
        $isWithinArrival = $distanceToDestination !== null && $distanceToDestination <= $arrivalRadiusMeters;

        $nearAccuracyOk = $this->isAccuracyWithinThreshold(
            accuracyMeters: $accuracyMeters,
            maxAccuracyMeters: (float) config('tracking.near_max_accuracy_meters', 150),
        );

        $arrivalAccuracyOk = $this->isAccuracyWithinThreshold(
            accuracyMeters: $accuracyMeters,
            maxAccuracyMeters: (float) config('tracking.arrival_max_accuracy_meters', 60),
        );

        return [
            'distance_to_destination_meters' => $distanceToDestination,
            'distance_remaining_meters' => $distanceRemaining,
            'movement_from_start_meters' => $movementFromStartMeters,
            'movement_started' => $movementStarted,
            'can_mark_near' => $movementStarted && $isWithinNear && $nearAccuracyOk,
            'can_mark_arrival' => $movementStarted && $isWithinArrival && $arrivalAccuracyOk,
            'near_radius_meters' => $nearRadiusMeters,
            'arrival_radius_meters' => $arrivalRadiusMeters,
        ];
    }

    /**
     * Evaluate the geofence at the moment tracking starts. Unlike movement
     * updates this intentionally ignores the "movement started" gate so an agent
     * who begins a task already at the destination can still reach "arrived".
     * Mutates the session in-memory; the caller is responsible for persisting.
     *
     * @return array{near: bool, arrived: bool}
     */
    private function evaluateStartGeofence(
        TaskTrackingSession $session,
        float $latitude,
        float $longitude,
        ?float $accuracyMeters,
        Carbon $recordedAt,
    ): array {
        $proximity = $this->buildProximitySnapshot($session, $latitude, $longitude, $accuracyMeters);
        $distance = $proximity['distance_to_destination_meters'];

        if ($distance === null) {
            return ['near' => false, 'arrived' => false];
        }

        $nearAccuracyOk = $this->isAccuracyWithinThreshold(
            accuracyMeters: $accuracyMeters,
            maxAccuracyMeters: (float) config('tracking.near_max_accuracy_meters', 150),
        );
        $arrivalAccuracyOk = $this->isAccuracyWithinThreshold(
            accuracyMeters: $accuracyMeters,
            maxAccuracyMeters: (float) config('tracking.arrival_max_accuracy_meters', 60),
        );

        $near = $distance <= $proximity['near_radius_meters'] && $nearAccuracyOk;
        $arrived = $distance <= $proximity['arrival_radius_meters'] && $arrivalAccuracyOk;

        if (($near || $arrived) && $session->near_detected_at === null) {
            $session->near_detected_at = $recordedAt;
            $session->near_latitude = $latitude;
            $session->near_longitude = $longitude;
        }

        if ($arrived && $session->arrival_detected_at === null) {
            $session->arrival_detected_at = $recordedAt;
            $session->arrival_latitude = $latitude;
            $session->arrival_longitude = $longitude;
        }

        return ['near' => $near || $arrived, 'arrived' => $arrived];
    }

    private function hasSatisfiedNearDwellTime(TaskTrackingSession $session, Carbon $recordedAt): bool
    {
        if (! $session->near_detected_at) {
            return false;
        }

        $requiredSeconds = max(0, (int) config('tracking.min_seconds_between_near_and_arrival', 10));
        if ($requiredSeconds === 0) {
            return true;
        }

        return $session->near_detected_at->diffInSeconds($recordedAt) >= $requiredSeconds;
    }

    private function resolveProximityState(TaskTrackingSession $session, ?string $taskStatus): string
    {
        if ($this->isTerminalStatus($taskStatus) || $session->end_recorded_at !== null) {
            return 'completed';
        }

        if ($session->arrival_detected_at !== null) {
            return 'arrived';
        }

        if ($session->near_detected_at !== null) {
            return 'near_destination';
        }

        return 'in_progress';
    }

    private function calculateDistanceToDestination(
        TaskTrackingSession $session,
        float $latitude,
        float $longitude,
    ): ?float {
        if ($session->destination_latitude === null || $session->destination_longitude === null) {
            return null;
        }

        return $this->distanceMeters(
            (float) $session->destination_latitude,
            (float) $session->destination_longitude,
            $latitude,
            $longitude,
        );
    }

    private function calculateDistanceRemainingToArrival(
        TaskTrackingSession $session,
        float $latitude,
        float $longitude,
    ): ?float {
        $distanceToDestination = $this->calculateDistanceToDestination($session, $latitude, $longitude);
        if ($distanceToDestination === null) {
            return null;
        }

        $arrivalRadius = max(1.0, (float) ($session->destination_radius_meters ?? config('tracking.arrival_radius_meters', 75)));

        return max(0.0, $distanceToDestination - $arrivalRadius);
    }

    private function distanceFromSessionStart(TaskTrackingSession $session, float $latitude, float $longitude): float
    {
        return $this->distanceMeters(
            (float) $session->start_latitude,
            (float) $session->start_longitude,
            $latitude,
            $longitude,
        );
    }

    private function isAccuracyWithinThreshold(?float $accuracyMeters, float $maxAccuracyMeters): bool
    {
        if ($accuracyMeters === null) {
            // Don't permanently block proximity for devices that never report
            // accuracy; rely on the distance + movement gates instead.
            return (bool) config('tracking.allow_unknown_accuracy', true);
        }

        return $accuracyMeters > 0 && $accuracyMeters <= max(1.0, $maxAccuracyMeters);
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

    private function upsertSnapshotAndBuildRealtimePayload(
        TaskTrackingSession $session,
        Task $task,
        int $userId,
        float $latitude,
        float $longitude,
        ?float $accuracyMeters,
        ?float $speedMps,
        ?float $headingDegrees,
        string $eventType,
        ?string $taskStatus,
        bool $arrived,
        bool $nearDestination,
        bool $movementStarted,
        ?float $distanceToDestinationMeters,
        ?float $distanceRemainingMeters,
        string $proximityState,
        Carbon $recordedAt,
    ): array {
        $snapshot = $this->agentLocationSnapshotService->upsertFromTrackingEvent([
            'company_id' => $session->company_id,
            'task_id' => $task->id,
            'tracking_session_id' => $session->id,
            'user_id' => $userId,
            'latitude' => $latitude,
            'longitude' => $longitude,
            'accuracy_meters' => $accuracyMeters,
            'speed_mps' => $speedMps,
            'heading_degrees' => $headingDegrees,
            'event_type' => $eventType,
            'task_status' => $taskStatus,
            'arrived' => $arrived,
            'recorded_at' => $recordedAt->toIso8601String(),
        ]);

        $staleAfterSeconds = max(60, (int) config('tracking.agent_location_stale_after_seconds', 300));
        $ageSeconds = $snapshot->last_seen_at
            ? max(0, now()->getTimestamp() - $snapshot->last_seen_at->getTimestamp())
            : null;
        $isOnline = $ageSeconds !== null && $ageSeconds <= $staleAfterSeconds;
        $etaSeconds = $this->estimateEtaSeconds($distanceRemainingMeters, $speedMps);
        $routeDeviationMeters = $this->calculateRouteDeviationMeters($session, $latitude, $longitude);
        $operationalStatus = $this->resolveOperationalStatus(
            task: $task,
            proximityState: $proximityState,
            movementStarted: $movementStarted,
            isOnline: $isOnline,
            etaSeconds: $etaSeconds,
        );

        return [
            'task_status' => $taskStatus,
            'latitude' => $latitude,
            'longitude' => $longitude,
            'accuracy_meters' => $accuracyMeters,
            'speed_mps' => $speedMps,
            'heading_degrees' => $headingDegrees,
            'arrived' => $arrived,
            'near_destination' => $nearDestination,
            'movement_started' => $movementStarted,
            'near_recorded_at' => $session->near_detected_at?->toIso8601String(),
            'arrival_recorded_at' => $session->arrival_detected_at?->toIso8601String(),
            'distance_to_destination_meters' => $distanceToDestinationMeters !== null
                ? round($distanceToDestinationMeters, 2)
                : null,
            'distance_remaining_meters' => $distanceRemainingMeters !== null
                ? round($distanceRemainingMeters, 2)
                : null,
            'eta_seconds' => $etaSeconds,
            'route_deviation_meters' => $routeDeviationMeters !== null ? round($routeDeviationMeters, 2) : null,
            'proximity_state' => $proximityState,
            'operational_status' => $operationalStatus,
            'event_type' => $eventType,
            'task' => [
                'id' => $task->id,
                'title' => $task->title,
                'status' => $taskStatus,
                'address' => $task->address_full,
                'location' => $task->location_text,
                'destination_latitude' => $task->latitude,
                'destination_longitude' => $task->longitude,
                'project' => $task->relationLoaded('project') && $task->project !== null
                    ? [
                        'id' => $task->project->id,
                        'name' => $task->project->name,
                        'status' => $task->project->status?->value,
                    ]
                    : null,
            ],
            'destination' => [
                'latitude' => $session->destination_latitude,
                'longitude' => $session->destination_longitude,
                'radius_meters' => $session->destination_radius_meters,
                'near_radius_meters' => max(
                    (float) (($session->destination_radius_meters ?? config('tracking.arrival_radius_meters', 75)) + 1),
                    (float) config('tracking.near_radius_meters', 250),
                ),
            ],
            'agent' => [
                'id' => $snapshot->user_id,
                'name' => $snapshot->agent?->name,
                'avatar_url' => $snapshot->agent?->avatar,
                'internal_role' => $snapshot->agent?->internal_role,
            ],
            'location' => [
                'latitude' => $snapshot->latitude,
                'longitude' => $snapshot->longitude,
                'accuracy_meters' => $snapshot->accuracy_meters,
                'speed_mps' => $snapshot->speed_mps,
                'heading_degrees' => $snapshot->heading_degrees,
                'event_type' => $snapshot->event_type,
                'arrived' => $arrived,
                'near_destination' => $nearDestination,
                'distance_to_destination_meters' => $distanceToDestinationMeters !== null
                    ? round($distanceToDestinationMeters, 2)
                    : null,
                'distance_remaining_meters' => $distanceRemainingMeters !== null
                    ? round($distanceRemainingMeters, 2)
                    : null,
                'eta_seconds' => $etaSeconds,
                'route_deviation_meters' => $routeDeviationMeters !== null ? round($routeDeviationMeters, 2) : null,
                'recorded_at' => $snapshot->recorded_at?->toIso8601String(),
            ],
            'status' => [
                'is_online' => $isOnline,
                'is_stale' => ! $isOnline,
                'last_seen_at' => $snapshot->last_seen_at?->toIso8601String(),
                'stale_after_seconds' => $staleAfterSeconds,
                'age_seconds' => $ageSeconds,
                'proximity_state' => $proximityState,
                'operational_status' => $operationalStatus,
            ],
        ];
    }

    private function estimateEtaSeconds(?float $distanceRemainingMeters, ?float $speedMps): ?int
    {
        if ($distanceRemainingMeters === null || $speedMps === null) {
            return null;
        }

        if ($distanceRemainingMeters <= 0 || $speedMps <= 0.35) {
            return null;
        }

        return (int) max(0, round($distanceRemainingMeters / $speedMps));
    }

    private function calculateRouteDeviationMeters(TaskTrackingSession $session, float $latitude, float $longitude): ?float
    {
        if (
            $session->start_latitude === null
            || $session->start_longitude === null
            || $session->destination_latitude === null
            || $session->destination_longitude === null
        ) {
            return null;
        }

        $startLat = (float) $session->start_latitude;
        $startLng = (float) $session->start_longitude;
        $destLat = (float) $session->destination_latitude;
        $destLng = (float) $session->destination_longitude;

        // Convert to a local meter plane for stable short-distance projection.
        $latFactor = 111320.0;
        $meanLatRad = deg2rad(($startLat + $destLat + $latitude) / 3.0);
        $lngFactor = 111320.0 * cos($meanLatRad);

        $ax = 0.0;
        $ay = 0.0;
        $bx = ($destLng - $startLng) * $lngFactor;
        $by = ($destLat - $startLat) * $latFactor;
        $px = ($longitude - $startLng) * $lngFactor;
        $py = ($latitude - $startLat) * $latFactor;

        $abx = $bx - $ax;
        $aby = $by - $ay;
        $abSquared = $abx * $abx + $aby * $aby;

        if ($abSquared <= 0.0001) {
            return null;
        }

        $apx = $px - $ax;
        $apy = $py - $ay;
        $t = (($apx * $abx) + ($apy * $aby)) / $abSquared;
        $tClamped = max(0.0, min(1.0, $t));

        $closestX = $ax + ($abx * $tClamped);
        $closestY = $ay + ($aby * $tClamped);

        return sqrt((($px - $closestX) ** 2) + (($py - $closestY) ** 2));
    }

    private function resolveOperationalStatus(
        Task $task,
        string $proximityState,
        bool $movementStarted,
        bool $isOnline,
        ?int $etaSeconds,
    ): string {
        if ($task->status?->value === TaskStatus::COMPLETED->value || $proximityState === 'completed') {
            return 'completed';
        }

        if (! $isOnline) {
            return 'offline';
        }

        if ($proximityState === 'arrived') {
            return 'destination_reached';
        }

        if ($proximityState === 'near_destination') {
            return 'near_destination';
        }

        $isDelayedByEta = $etaSeconds !== null
            && $etaSeconds >= max(60, (int) config('tracking.delayed_eta_threshold_seconds', 1800));
        $isDelayedByDueAt = $task->due_at !== null && $task->due_at->isPast();

        if ($isDelayedByEta || $isDelayedByDueAt) {
            return 'delayed';
        }

        return $movementStarted ? 'en_route' : 'available';
    }

    /**
     * Structured lifecycle log for a tracking session. Keeps a consistent shape
     * (source + contextual fields) so tracking issues are easy to trace.
     */
    private function logLifecycle(string $event, array $context = []): void
    {
        Log::info("[tracking] {$event}", array_merge(['source' => 'TaskTrackingService'], $context));
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

    private function notifyTrackingEvent(
        Task $task,
        User $actor,
        string $type,
        string $title,
        string $message,
        string $priority,
    ): void {
        $recipientIds = DB::table('company_users')
            ->where('company_id', $task->company_id)
            ->whereIn('role', ['owner', 'admin', 'supervisor'])
            ->pluck('user_id')
            ->map(static fn(mixed $id): int => (int) $id)
            ->merge([(int) $task->created_by_user_id, (int) ($task->assigned_agent_id ?? 0)])
            ->filter(static fn(int $id): bool => $id > 0)
            ->unique()
            ->reject(static fn(int $id): bool => $id === (int) $actor->id)
            ->values()
            ->all();

        foreach ($recipientIds as $recipientId) {
            $this->notificationService->notifyUser($recipientId, [
                'company_id' => (int) $task->company_id,
                'type' => $type,
                'category' => NotificationCategory::TRACKING->value,
                'title' => $title,
                'message' => $message,
                'reference_type' => Task::class,
                'reference_id' => (int) $task->id,
                'action_url' => '/tasks/' . $task->id,
                'action_route' => 'tasks.show',
                'priority' => $priority,
                'created_by_user_id' => (int) $actor->id,
                'metadata' => [
                    'task_id' => (int) $task->id,
                    'task_status' => $task->status?->value,
                    'actor_user_id' => (int) $actor->id,
                ],
                'dedupe_key' => $type . ':' . $task->id . ':' . $recipientId,
            ]);
        }
    }
}
