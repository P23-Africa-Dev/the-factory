<?php

declare(strict_types=1);

namespace App\Services\Task;

use App\Exceptions\TaskCommentPersistenceException;
use App\Models\Task;
use App\Models\TaskComment;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Task comment thread between the people assigned to a task and the people who assigned it.
 *
 * Access rules:
 *  - Read: owners, admins and supervisors of the task's company, plus task participants.
 *  - Write: owners and admins of the company, plus task participants.
 *
 * Participants are: current assignees, the task creator, and whoever made a current assignment.
 * All participants share a single thread per task.
 */
class TaskCommentService
{
    public const MAX_BODY_LENGTH = 2000;

    private const OVERSIGHT_ROLES = ['owner', 'admin'];

    public function __construct(private readonly TaskAccessService $accessService) {}

    /**
     * @return array{comments: Collection<int, TaskComment>, can_comment: bool, roles: array<int, string>}
     */
    public function listForUser(User $user, Task $task, ?int $companyId = null): array
    {
        $context = $this->resolveContextForTask($user, $task, $companyId);

        if (! $this->canView($context, $user, $task)) {
            throw new AuthorizationException('You do not have access to comments on this task.');
        }

        $comments = $task->comments()
            ->with('author:id,name,avatar,gender')
            ->orderBy('created_at')
            ->orderBy('id')
            ->get();

        return [
            'comments' => $comments,
            'can_comment' => $this->canComment($context, $user, $task),
            'roles' => $this->authorRoles($task->company_id, $comments->pluck('author_user_id')->all()),
        ];
    }

    /**
     * @return array{comment: TaskComment, roles: array<int, string>}
     */
    public function create(User $user, Task $task, string $body, ?int $companyId = null): array
    {
        $context = $this->resolveContextForTask($user, $task, $companyId);

        if (! $this->canComment($context, $user, $task)) {
            throw new AuthorizationException('You are not allowed to comment on this task.');
        }

        try {
            $comment = TaskComment::create([
                'company_id' => $task->company_id,
                'task_id' => $task->id,
                // Author is always the authenticated user; never taken from input.
                'author_user_id' => $user->id,
                'body' => $body,
            ]);
        } catch (QueryException $exception) {
            Log::error('Failed to store task comment.', [
                'task_id' => $task->id,
                'user_id' => $user->id,
                'error' => $exception->getMessage(),
            ]);

            throw new TaskCommentPersistenceException('Unable to save your comment right now. Please try again.', 0, $exception);
        }

        $comment->load('author:id,name,avatar,gender');

        return [
            'comment' => $comment,
            'roles' => $this->authorRoles($task->company_id, [$user->id]),
        ];
    }

    private function resolveContextForTask(User $user, Task $task, ?int $companyId): TaskAccessContext
    {
        // Default to the task's own company so users in several companies resolve the right membership.
        $context = $this->accessService->resolve($user, $companyId ?? (int) $task->company_id);

        if ((int) $task->company_id !== (int) $context->company->id) {
            // Do not reveal tasks that belong to another tenant.
            throw (new ModelNotFoundException)->setModel(Task::class, [$task->id]);
        }

        return $context;
    }

    private function canView(TaskAccessContext $context, User $user, Task $task): bool
    {
        return $context->canManageTasks() || $this->isParticipant($task, $user);
    }

    private function canComment(TaskAccessContext $context, User $user, Task $task): bool
    {
        return in_array($context->role, self::OVERSIGHT_ROLES, true) || $this->isParticipant($task, $user);
    }

    private function isParticipant(Task $task, User $user): bool
    {
        $userId = (int) $user->id;

        if ((int) $task->created_by_user_id === $userId || (int) $task->assigned_agent_id === $userId) {
            return true;
        }

        return $task->assignments()
            ->where('is_current', true)
            ->where(function ($query) use ($userId): void {
                $query->where('assigned_agent_id', $userId)
                    ->orWhere('assigned_by_user_id', $userId);
            })
            ->exists();
    }

    /**
     * @param  array<int, int|string>  $userIds
     * @return array<int, string>
     */
    private function authorRoles(int|string $companyId, array $userIds): array
    {
        if ($userIds === []) {
            return [];
        }

        return DB::table('company_users')
            ->where('company_id', $companyId)
            ->whereIn('user_id', array_unique(array_map('intval', $userIds)))
            ->pluck('role', 'user_id')
            ->mapWithKeys(fn ($role, $userId): array => [(int) $userId => (string) $role])
            ->all();
    }
}
