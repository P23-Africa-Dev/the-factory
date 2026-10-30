<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Task;

use App\Exceptions\TaskCommentPersistenceException;
use App\Http\Controllers\Concerns\ResolvesCompanyContextId;
use App\Http\Controllers\Controller;
use App\Http\Requests\Task\StoreTaskCommentRequest;
use App\Http\Resources\TaskCommentResource;
use App\Models\Task;
use App\Models\TaskComment;
use App\Services\Task\TaskCommentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TaskCommentController extends Controller
{
    use ResolvesCompanyContextId;

    public function __construct(private readonly TaskCommentService $commentService) {}

    public function index(Request $request, Task $task): JsonResponse
    {
        $result = $this->commentService->listForUser(
            $request->user(),
            $task,
            $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Task comments fetched successfully.',
            data: [
                'items' => $result['comments']
                    ->map(fn (TaskComment $comment) => new TaskCommentResource($comment, $result['roles']))
                    ->values(),
                'can_comment' => $result['can_comment'],
            ],
        );
    }

    public function store(StoreTaskCommentRequest $request, Task $task): JsonResponse
    {
        $validated = $request->validated();

        try {
            $result = $this->commentService->create(
                $request->user(),
                $task,
                (string) $validated['body'],
                isset($validated['company_id']) ? (int) $validated['company_id'] : null,
            );
        } catch (TaskCommentPersistenceException $exception) {
            return $this->error($exception->getMessage(), null, 500);
        }

        return $this->success(
            message: 'Comment added successfully.',
            data: ['comment' => new TaskCommentResource($result['comment'], $result['roles'])],
            status: 201,
        );
    }
}
