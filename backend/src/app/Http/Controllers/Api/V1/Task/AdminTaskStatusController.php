<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Task;

use App\Http\Controllers\Controller;
use App\Http\Requests\Task\AdminUpdateTaskStatusRequest;
use App\Http\Resources\TaskResource;
use App\Models\Task;
use App\Services\Task\TaskService;
use App\Services\Task\TaskTrackingService;
use Illuminate\Http\JsonResponse;

class AdminTaskStatusController extends Controller
{
    public function __construct(
        private readonly TaskService $taskService,
        private readonly TaskTrackingService $trackingService,
    ) {}

    public function update(AdminUpdateTaskStatusRequest $request, Task $task): JsonResponse
    {
        $companyId = $request->validated('company_id');
        $status = (string) $request->validated('status');

        $updatedTask = $this->taskService->updateStatusForManager(
            user: $request->user(),
            task: $task,
            status: $status,
            companyId: $companyId !== null ? (int) $companyId : null,
        );

        // Keep live tracking in sync when a manager stops/cancels/completes a task.
        $this->trackingService->stopTrackingForStatusChange($updatedTask, $request->user(), $status);

        return $this->success(
            message: 'Task status updated successfully.',
            data: ['task' => new TaskResource($updatedTask)],
        );
    }
}
