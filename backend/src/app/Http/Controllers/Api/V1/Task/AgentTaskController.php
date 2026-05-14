<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Task;

use App\Http\Controllers\Controller;
use App\Http\Requests\Task\CreateSelfTaskRequest;
use App\Http\Resources\TaskResource;
use App\Services\Task\TaskService;
use Illuminate\Http\JsonResponse;

class AgentTaskController extends Controller
{
    public function __construct(private readonly TaskService $taskService) {}

    public function storeSelf(CreateSelfTaskRequest $request): JsonResponse
    {
        $task = $this->taskService->createSelf($request->user(), $request->validated());

        return $this->success(
            message: 'Self task created successfully.',
            data: ['task' => new TaskResource($task)],
            status: 201,
        );
    }
}
