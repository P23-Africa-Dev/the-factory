<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Task;

use App\Http\Controllers\Controller;
use App\Http\Requests\Task\CompleteTrackedTaskRequest;
use App\Http\Requests\Task\GetTaskRouteRequest;
use App\Http\Requests\Task\RecordTaskLocationRequest;
use App\Http\Requests\Task\StartTaskTrackingRequest;
use App\Http\Resources\TaskProofResource;
use App\Http\Resources\TaskResource;
use App\Models\Task;
use App\Models\TaskTrackingSession;
use App\Services\Task\TaskTrackingService;
use Illuminate\Http\JsonResponse;

class TaskTrackingController extends Controller
{
    public function __construct(private readonly TaskTrackingService $trackingService) {}

    public function start(StartTaskTrackingRequest $request, Task $task): JsonResponse
    {
        $result = $this->trackingService->start($request->user(), $task, $request->validated());

        return $this->success(
            message: 'Task tracking started successfully.',
            data: [
                'task' => new TaskResource($result['task']),
                'tracking' => $this->trackingSessionPayload($result['session']),
                'near_destination' => $result['near_destination'],
                'arrived' => $result['arrived'],
                'proximity_state' => $result['proximity_state'],
                'distance_to_destination_meters' => $result['distance_to_destination_meters'],
                'distance_remaining_meters' => $result['distance_remaining_meters'],
                'movement_started' => $result['movement_started'],
                'demo_simulation_active' => (bool) ($result['demo_simulation_active'] ?? false),
            ],
        );
    }

    public function location(RecordTaskLocationRequest $request, Task $task): JsonResponse
    {
        $result = $this->trackingService->recordLocation($request->user(), $task, $request->validated());

        return $this->success(
            message: 'Task location recorded successfully.',
            data: [
                'task' => new TaskResource($result['task']),
                'tracking' => $this->trackingSessionPayload($result['session']),
                'received_points' => $result['received_points'],
                'persisted_points' => $result['persisted_points'],
                'near_destination' => $result['near_destination'],
                'arrived' => $result['arrived'],
                'proximity_state' => $result['proximity_state'],
                'distance_to_destination_meters' => $result['distance_to_destination_meters'],
                'distance_remaining_meters' => $result['distance_remaining_meters'],
                'movement_started' => $result['movement_started'],
            ],
        );
    }

    public function complete(CompleteTrackedTaskRequest $request, Task $task): JsonResponse
    {
        $result = $this->trackingService->complete($request->user(), $task, $request->validated());

        return $this->success(
            message: 'Task completed with tracking data successfully.',
            data: [
                'task' => new TaskResource($result['task']),
                'tracking' => $this->trackingSessionPayload($result['session']),
                'proofs' => TaskProofResource::collection($result['proofs']),
            ],
        );
    }

    public function route(GetTaskRouteRequest $request, Task $task): JsonResponse
    {
        $result = $this->trackingService->routeForUser(
            user: $request->user(),
            task: $task,
            filters: $request->validated(),
        );

        return $this->success(
            message: 'Task route fetched successfully.',
            data: $result,
        );
    }

    private function trackingSessionPayload(TaskTrackingSession $session): array
    {
        return [
            'id' => $session->id,
            'task_id' => $session->task_id,
            'company_id' => $session->company_id,
            'start' => [
                'latitude' => $session->start_latitude,
                'longitude' => $session->start_longitude,
                'accuracy_meters' => $session->start_accuracy_meters,
                'recorded_at' => $session->start_recorded_at?->toIso8601String(),
            ],
            'arrival' => [
                'latitude' => $session->arrival_latitude,
                'longitude' => $session->arrival_longitude,
                'recorded_at' => $session->arrival_detected_at?->toIso8601String(),
            ],
            'near' => [
                'latitude' => $session->near_latitude,
                'longitude' => $session->near_longitude,
                'recorded_at' => $session->near_detected_at?->toIso8601String(),
            ],
            'end' => [
                'latitude' => $session->end_latitude,
                'longitude' => $session->end_longitude,
                'accuracy_meters' => $session->end_accuracy_meters,
                'recorded_at' => $session->end_recorded_at?->toIso8601String(),
            ],
            'destination' => [
                'latitude' => $session->destination_latitude,
                'longitude' => $session->destination_longitude,
                'radius_meters' => $session->destination_radius_meters,
            ],
            'updated_at' => $session->updated_at?->toIso8601String(),
        ];
    }
}
