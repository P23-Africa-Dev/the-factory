<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Task;

use App\Http\Controllers\Controller;
use App\Http\Requests\Task\UpdateTaskStatusRequest;
use App\Http\Resources\TaskResource;
use App\Models\Task;
use App\Services\Task\TaskService;
use Illuminate\Http\JsonResponse;

class TaskStatusController extends Controller
{
    public function __construct(private readonly TaskService $taskService) {}

    public function update(UpdateTaskStatusRequest $request, Task $task): JsonResponse
    {
        $companyId = $request->validated('company_id');

        $updatedTask = $this->taskService->updateStatus(
            user: $request->user(),
            task: $task,
            status: (string) $request->validated('status'),
            companyId: $companyId !== null ? (int) $companyId : null,
        );

        return $this->success(
            message: 'Task status updated successfully.',
            data: ['task' => new TaskResource($updatedTask)],
        );
    }
}
