<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Task;

use App\Http\Controllers\Concerns\ResolvesCompanyContextId;
use App\Http\Controllers\Controller;
use App\Http\Requests\Task\CreateTaskRequest;
use App\Http\Resources\TaskResource;
use App\Models\Task;
use App\Services\Task\TaskService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TaskController extends Controller
{
    use ResolvesCompanyContextId;

    public function __construct(private readonly TaskService $taskService) {}

    public function index(Request $request): JsonResponse
    {
        $tasks = $this->taskService->listForUser($request->user(), [
            'company_id' => $this->resolveCompanyContextId($request->input('company_id')),
            'status' => $request->string('status')->toString(),
            'priority' => $request->string('priority')->toString(),
            'type' => $request->string('type')->toString(),
        ]);

        return $this->success(
            message: 'Tasks fetched successfully.',
            data: [
                'items' => TaskResource::collection($tasks->items()),
                'pagination' => [
                    'next_page_url' => $tasks->nextPageUrl(),
                    'prev_page_url' => $tasks->previousPageUrl(),
                    'per_page' => $tasks->perPage(),
                ],
            ],
        );
    }

    public function store(CreateTaskRequest $request): JsonResponse
    {
        $task = $this->taskService->create($request->user(), $request->validated());

        return $this->success(
            message: 'Task created successfully.',
            data: ['task' => new TaskResource($task)],
            status: 201,
        );
    }

    public function show(Request $request, Task $task): JsonResponse
    {
        $task = $this->taskService->findForUser(
            $request->user(),
            $task,
            $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Task fetched successfully.',
            data: ['task' => new TaskResource($task)],
        );
    }
}
