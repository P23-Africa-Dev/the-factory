<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Task;

use App\Http\Controllers\Controller;
use App\Http\Requests\Task\AssignTaskRequest;
use App\Http\Requests\Task\ListTaskReassignmentsRequest;
use App\Http\Requests\Task\RespondTaskReassignmentRequest;
use App\Http\Resources\TaskReassignmentResource;
use App\Models\Task;
use App\Models\TaskReassignment;
use App\Services\Task\TaskReassignmentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;

class TaskAssignmentController extends Controller
{
    public function __construct(private readonly TaskReassignmentService $taskReassignmentService) {}

    public function update(AssignTaskRequest $request, Task $task): JsonResponse
    {
        $agentIds = array_map('intval', $request->validated('assigned_agent_ids', []));
        $toUserId = $request->validated('to_user_id');

        if ($toUserId === null && $agentIds !== []) {
            $toUserId = $agentIds[0];
        }

        if ($toUserId === null) {
            throw ValidationException::withMessages([
                'to_user_id' => ['A reassignment target is required.'],
            ]);
        }

        $companyId = $request->validated('company_id');

        $reassignment = $this->taskReassignmentService->request(
            user: $request->user(),
            task: $task,
            toUserId: (int) $toUserId,
            companyId: $companyId !== null ? (int) $companyId : null,
            reason: $request->validated('reason'),
        );

        return $this->success(
            message: 'Task reassignment request created.',
            data: [
                'reassignment' => new TaskReassignmentResource($reassignment),
            ],
        );
    }

    public function inbox(ListTaskReassignmentsRequest $request): JsonResponse
    {
        $companyId = $request->validated('company_id');

        $reassignments = $this->taskReassignmentService->inbox(
            user: $request->user(),
            companyId: $companyId !== null ? (int) $companyId : null,
            status: $request->validated('status'),
        );

        return $this->success(
            message: 'Task reassignment inbox fetched successfully.',
            data: [
                'reassignments' => TaskReassignmentResource::collection($reassignments),
            ],
        );
    }

    public function accept(RespondTaskReassignmentRequest $request, TaskReassignment $reassignment): JsonResponse
    {
        $companyId = $request->validated('company_id');

        $updated = $this->taskReassignmentService->accept(
            user: $request->user(),
            reassignment: $reassignment,
            companyId: $companyId !== null ? (int) $companyId : null,
            responseNote: $request->validated('response_note'),
        );

        return $this->success(
            message: 'Task reassignment accepted successfully.',
            data: [
                'reassignment' => new TaskReassignmentResource($updated),
            ],
        );
    }

    public function reject(RespondTaskReassignmentRequest $request, TaskReassignment $reassignment): JsonResponse
    {
        $companyId = $request->validated('company_id');

        $updated = $this->taskReassignmentService->reject(
            user: $request->user(),
            reassignment: $reassignment,
            companyId: $companyId !== null ? (int) $companyId : null,
            responseNote: $request->validated('response_note'),
        );

        return $this->success(
            message: 'Task reassignment rejected successfully.',
            data: [
                'reassignment' => new TaskReassignmentResource($updated),
            ],
        );
    }
}
