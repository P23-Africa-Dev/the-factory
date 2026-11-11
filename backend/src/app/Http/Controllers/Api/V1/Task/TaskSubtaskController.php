<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Task;

use App\Http\Controllers\Concerns\ResolvesCompanyContextId;
use App\Http\Controllers\Controller;
use App\Http\Requests\Task\CompleteTaskSubtaskRequest;
use App\Http\Requests\Task\ReorderTaskSubtasksRequest;
use App\Http\Requests\Task\StoreTaskSubtaskRequest;
use App\Http\Requests\Task\UpdateTaskSubtaskRequest;
use App\Http\Resources\TaskResource;
use App\Http\Resources\TaskSubtaskResource;
use App\Models\Task;
use App\Models\TaskSubtask;
use App\Services\Task\TaskSubtaskService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TaskSubtaskController extends Controller
{
    use ResolvesCompanyContextId;

    public function __construct(private readonly TaskSubtaskService $subtaskService) {}

    public function store(StoreTaskSubtaskRequest $request, Task $task): JsonResponse
    {
        $result = $this->subtaskService->add($request->user(), $task, $request->validated());

        return $this->success(
            message: 'Subtask added successfully.',
            data: [
                'task' => new TaskResource($result['task']),
                'subtask' => new TaskSubtaskResource($result['subtask']),
                'status_changed' => $result['status_changed'],
                'completion_blocked_reason' => $result['completion_blocked_reason'],
            ],
            status: 201,
        );
    }

    public function update(UpdateTaskSubtaskRequest $request, Task $task, TaskSubtask $subtask): JsonResponse
    {
        $result = $this->subtaskService->update($request->user(), $task, $subtask, $request->validated());

        return $this->success(
            message: 'Subtask updated successfully.',
            data: [
                'task' => new TaskResource($result['task']),
                'subtask' => new TaskSubtaskResource($result['subtask']),
                'status_changed' => $result['status_changed'],
                'completion_blocked_reason' => $result['completion_blocked_reason'],
            ],
        );
    }

    public function complete(CompleteTaskSubtaskRequest $request, Task $task, TaskSubtask $subtask): JsonResponse
    {
        $validated = $request->validated();
        $result = $this->subtaskService->setCompleted(
            $request->user(),
            $task,
            $subtask,
            (bool) $validated['is_completed'],
            isset($validated['company_id']) ? (int) $validated['company_id'] : null,
        );

        return $this->success(
            message: 'Subtask completion updated successfully.',
            data: [
                'task' => new TaskResource($result['task']),
                'subtask' => new TaskSubtaskResource($result['subtask']),
                'status_changed' => $result['status_changed'],
                'completion_blocked_reason' => $result['completion_blocked_reason'],
            ],
        );
    }

    public function reorder(ReorderTaskSubtasksRequest $request, Task $task): JsonResponse
    {
        $validated = $request->validated();
        $result = $this->subtaskService->reorder(
            $request->user(),
            $task,
            $validated['subtask_ids'],
            isset($validated['company_id']) ? (int) $validated['company_id'] : null,
        );

        return $this->success(
            message: 'Subtasks reordered successfully.',
            data: [
                'task' => new TaskResource($result['task']),
            ],
        );
    }

    public function destroy(Request $request, Task $task, TaskSubtask $subtask): JsonResponse
    {
        $result = $this->subtaskService->delete(
            $request->user(),
            $task,
            $subtask,
            $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Subtask deleted successfully.',
            data: [
                'task' => new TaskResource($result['task']),
                'deleted_subtask_id' => $result['deleted_subtask_id'],
                'status_changed' => $result['status_changed'],
                'completion_blocked_reason' => $result['completion_blocked_reason'],
            ],
        );
    }
}
