<?php

declare(strict_types=1);

namespace App\Services\Task;

use App\Enums\TaskStatus;
use App\Models\Task;
use App\Models\TaskSubtask;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class TaskSubtaskService
{
    private const ASSIGNABLE_ROLES = ['owner', 'admin', 'supervisor', 'agent'];

    public function __construct(
        private readonly TaskAccessService $accessService,
        private readonly TaskService $taskService,
    ) {}

    /**
     * @param  array<int, array<string, mixed>>  $items
     */
    public function createMany(Task $task, User $actor, array $items, bool $selfAssignedFlow = false): void
    {
        if ($items === []) {
            return;
        }

        $position = 0;

        foreach ($items as $item) {
            $assigneeId = isset($item['assigned_user_id'])
                ? (int) $item['assigned_user_id']
                : (int) ($task->assigned_agent_id ?? $actor->id);

            if ($selfAssignedFlow && $assigneeId !== (int) $actor->id) {
                throw ValidationException::withMessages([
                    'subtasks' => ['Self-task subtasks can only be assigned to you.'],
                ]);
            }

            $this->ensureAssigneeBelongsToCompany((int) $task->company_id, $assigneeId);
            $this->assertSubtaskDueAtNotAfterTask($task, $item['due_at'] ?? null);

            TaskSubtask::create([
                'company_id' => $task->company_id,
                'task_id' => $task->id,
                'assigned_user_id' => $assigneeId,
                'created_by_user_id' => $actor->id,
                'title' => trim((string) $item['title']),
                'due_at' => $item['due_at'] ?? null,
                'position' => $position,
                'is_completed' => false,
                'completed_at' => null,
                'completed_by_user_id' => null,
            ]);

            $position++;
        }
    }

    /**
     * @return array{task: Task, subtask: TaskSubtask, status_changed: bool, completion_blocked_reason: ?string}
     */
    public function add(User $user, Task $task, array $data): array
    {
        $context = $this->resolveContextForTask($user, $task, $data['company_id'] ?? null);
        $this->assertNotCancelled($task);
        $this->assertIsCreator($user, $task);

        $assigneeId = isset($data['assigned_user_id'])
            ? (int) $data['assigned_user_id']
            : (int) ($task->assigned_agent_id ?? $user->id);

        $this->ensureAssigneeBelongsToCompany((int) $task->company_id, $assigneeId);
        $this->assertSubtaskDueAtNotAfterTask($task, $data['due_at'] ?? null);

        $result = DB::transaction(function () use ($task, $user, $data, $assigneeId, $context): array {
            $maxPosition = (int) $task->subtasks()->max('position');
            $position = $task->subtasks()->exists() ? $maxPosition + 1 : 0;

            $subtask = TaskSubtask::create([
                'company_id' => $task->company_id,
                'task_id' => $task->id,
                'assigned_user_id' => $assigneeId,
                'created_by_user_id' => $user->id,
                'title' => trim((string) $data['title']),
                'due_at' => $data['due_at'] ?? null,
                'position' => $position,
                'is_completed' => false,
            ]);

            $loaded = $this->taskService->reloadTaskForContext($task, $context);
            $subtask->load(['assignee', 'completer']);

            return [
                'task' => $loaded,
                'subtask' => $subtask,
                'status_changed' => false,
                'completion_blocked_reason' => null,
            ];
        });

        return $result;
    }

    /**
     * @return array{task: Task, subtask: TaskSubtask, status_changed: bool, completion_blocked_reason: ?string}
     */
    public function update(User $user, Task $task, TaskSubtask $subtask, array $data): array
    {
        $context = $this->resolveContextForTask($user, $task, $data['company_id'] ?? null);
        $this->assertSubtaskBelongsToTask($task, $subtask);
        $this->assertNotCancelled($task);
        $this->assertIsCreator($user, $task);

        if (array_key_exists('assigned_user_id', $data) && $data['assigned_user_id'] !== null) {
            $this->ensureAssigneeBelongsToCompany((int) $task->company_id, (int) $data['assigned_user_id']);
        }

        if (array_key_exists('due_at', $data)) {
            $this->assertSubtaskDueAtNotAfterTask($task, $data['due_at']);
        }

        return DB::transaction(function () use ($task, $subtask, $data, $context): array {
            $payload = [];

            if (array_key_exists('title', $data)) {
                $payload['title'] = trim((string) $data['title']);
            }

            if (array_key_exists('assigned_user_id', $data)) {
                $payload['assigned_user_id'] = $data['assigned_user_id'] !== null
                    ? (int) $data['assigned_user_id']
                    : null;
            }

            if (array_key_exists('due_at', $data)) {
                $payload['due_at'] = $data['due_at'];
            }

            if ($payload !== []) {
                $subtask->update($payload);
            }

            $loaded = $this->taskService->reloadTaskForContext($task, $context);
            $subtask->refresh()->load(['assignee', 'completer']);

            return [
                'task' => $loaded,
                'subtask' => $subtask,
                'status_changed' => false,
                'completion_blocked_reason' => null,
            ];
        });
    }

    /**
     * @return array{task: Task, subtask: TaskSubtask, status_changed: bool, completion_blocked_reason: ?string}
     */
    public function setCompleted(User $user, Task $task, TaskSubtask $subtask, bool $isCompleted, ?int $companyId = null): array
    {
        $context = $this->resolveContextForTask($user, $task, $companyId);
        $this->assertSubtaskBelongsToTask($task, $subtask);
        $this->assertNotCancelled($task);
        $this->assertCanComplete($user, $task, $subtask);

        return DB::transaction(function () use ($task, $subtask, $user, $isCompleted, $context): array {
            if ((bool) $subtask->is_completed === $isCompleted) {
                $loaded = $this->taskService->reloadTaskForContext($task, $context);
                $subtask->load(['assignee', 'completer']);

                return [
                    'task' => $loaded,
                    'subtask' => $subtask,
                    'status_changed' => false,
                    'completion_blocked_reason' => null,
                ];
            }

            if ($isCompleted) {
                $subtask->update([
                    'is_completed' => true,
                    'completed_at' => now(),
                    'completed_by_user_id' => $user->id,
                ]);
            } else {
                $subtask->update([
                    'is_completed' => false,
                    'completed_at' => null,
                    'completed_by_user_id' => null,
                ]);
            }

            $sync = $this->taskService->syncStatusFromSubtasks($task, $user);
            $loaded = $this->taskService->reloadTaskForContext($task->fresh(), $context);
            $subtask->refresh()->load(['assignee', 'completer']);

            return [
                'task' => $loaded,
                'subtask' => $subtask,
                'status_changed' => $sync['status_changed'],
                'completion_blocked_reason' => $sync['completion_blocked_reason'],
            ];
        });
    }

    /**
     * @param  array<int, int>  $subtaskIds
     * @return array{task: Task}
     */
    public function reorder(User $user, Task $task, array $subtaskIds, ?int $companyId = null): array
    {
        $context = $this->resolveContextForTask($user, $task, $companyId);
        $this->assertNotCancelled($task);
        $this->assertIsCreator($user, $task);

        $existingIds = $task->subtasks()->pluck('id')->map(static fn ($id): int => (int) $id)->sort()->values()->all();
        $requestedIds = collect($subtaskIds)->map(static fn ($id): int => (int) $id)->sort()->values()->all();

        if ($existingIds !== $requestedIds) {
            throw ValidationException::withMessages([
                'subtask_ids' => ['The reorder list must include every subtask of this task exactly once.'],
            ]);
        }

        return DB::transaction(function () use ($task, $subtaskIds, $context): array {
            foreach (array_values($subtaskIds) as $index => $subtaskId) {
                TaskSubtask::query()
                    ->where('task_id', $task->id)
                    ->whereKey((int) $subtaskId)
                    ->update(['position' => $index]);
            }

            return [
                'task' => $this->taskService->reloadTaskForContext($task, $context),
            ];
        });
    }

    /**
     * @return array{task: Task, deleted_subtask_id: int, status_changed: bool, completion_blocked_reason: ?string}
     */
    public function delete(User $user, Task $task, TaskSubtask $subtask, ?int $companyId = null): array
    {
        $context = $this->resolveContextForTask($user, $task, $companyId);
        $this->assertSubtaskBelongsToTask($task, $subtask);
        $this->assertNotCancelled($task);
        $this->assertIsCreator($user, $task);

        return DB::transaction(function () use ($task, $subtask, $user, $context): array {
            $deletedId = (int) $subtask->id;
            $subtask->delete();

            $remaining = $task->subtasks()->orderBy('position')->orderBy('id')->get();
            foreach ($remaining as $index => $item) {
                if ((int) $item->position !== $index) {
                    $item->update(['position' => $index]);
                }
            }

            $sync = $this->taskService->syncStatusFromSubtasks($task->fresh(), $user);

            return [
                'task' => $this->taskService->reloadTaskForContext($task->fresh(), $context),
                'deleted_subtask_id' => $deletedId,
                'status_changed' => $sync['status_changed'],
                'completion_blocked_reason' => $sync['completion_blocked_reason'],
            ];
        });
    }

    private function resolveContextForTask(User $user, Task $task, ?int $companyId): TaskAccessContext
    {
        $context = $this->accessService->resolve($user, $companyId ?? (int) $task->company_id);

        if ((int) $task->company_id !== (int) $context->company->id) {
            throw (new ModelNotFoundException)->setModel(Task::class, [$task->id]);
        }

        return $context;
    }

    private function assertSubtaskBelongsToTask(Task $task, TaskSubtask $subtask): void
    {
        if ((int) $subtask->task_id !== (int) $task->id || (int) $subtask->company_id !== (int) $task->company_id) {
            throw (new ModelNotFoundException)->setModel(TaskSubtask::class, [$subtask->id]);
        }
    }

    private function assertNotCancelled(Task $task): void
    {
        if ($task->status?->value === TaskStatus::CANCELLED->value) {
            throw ValidationException::withMessages([
                'status' => ['Terminal tasks cannot be changed.'],
            ]);
        }
    }

    private function assertIsCreator(User $user, Task $task): void
    {
        if ((int) $task->created_by_user_id !== (int) $user->id) {
            throw new AuthorizationException('Only the task creator can manage subtasks.');
        }
    }

    private function assertCanComplete(User $user, Task $task, TaskSubtask $subtask): void
    {
        $isCreator = (int) $task->created_by_user_id === (int) $user->id;
        $isAssignee = $subtask->assigned_user_id !== null
            && (int) $subtask->assigned_user_id === (int) $user->id;

        if (! $isCreator && ! $isAssignee) {
            throw new AuthorizationException('Only the subtask assignee or the task creator can complete this item.');
        }
    }

    private function assertSubtaskDueAtNotAfterTask(Task $task, mixed $dueAt): void
    {
        if ($dueAt === null || $dueAt === '' || $task->due_at === null) {
            return;
        }

        $subtaskDue = Carbon::parse($dueAt);
        if ($subtaskDue->gt($task->due_at)) {
            throw ValidationException::withMessages([
                'due_at' => ['The subtask due date cannot be later than the task due date.'],
            ]);
        }
    }

    private function ensureAssigneeBelongsToCompany(int $companyId, int $userId): void
    {
        $membership = DB::table('company_users')
            ->where('company_id', $companyId)
            ->where('user_id', $userId)
            ->first();

        $isActive = User::query()->whereKey($userId)->where('is_active', true)->exists();

        if (! $membership || ! $isActive || ! in_array((string) $membership->role, self::ASSIGNABLE_ROLES, true)) {
            throw ValidationException::withMessages([
                'assigned_user_id' => ['Selected user is not a member of this company.'],
            ]);
        }
    }
}
