<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Task;

use App\Http\Controllers\Controller;
use App\Http\Requests\Task\AssignTaskRequest;
use App\Http\Resources\TaskResource;
use App\Models\Task;
use App\Services\Task\TaskService;
use Illuminate\Http\JsonResponse;

class TaskAssignmentController extends Controller
{
    public function __construct(private readonly TaskService $taskService) {}

    public function update(AssignTaskRequest $request, Task $task): JsonResponse
    {
        $agentIds = array_map('intval', $request->validated('assigned_agent_ids', []));
        $companyId = $request->validated('company_id');

        $updatedTask = $this->taskService->reassign(
            user: $request->user(),
            task: $task,
            agentIds: $agentIds,
            companyId: $companyId !== null ? (int) $companyId : null,
        );

        return $this->success(
            message: 'Task reassigned successfully.',
            data: ['task' => new TaskResource($updatedTask)],
        );
    }
}
