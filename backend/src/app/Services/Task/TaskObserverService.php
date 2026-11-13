<?php

declare(strict_types=1);

namespace App\Services\Task;

use App\Enums\NotificationCategory;
use App\Enums\NotificationPriority;
use App\Models\Task;
use App\Models\TaskComment;
use App\Models\User;
use App\Notifications\TaskObserverAddedNotification;
use App\Services\Notification\NotificationService;
use App\Services\Workforce\OrganizationAgentRoster;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Observers follow a task and may comment on it, but they do not perform it:
 * status changes, proofs, tracking and subtask completion stay with assignees.
 */
class TaskObserverService
{
    public function __construct(
        private readonly TaskAccessService $accessService,
        private readonly NotificationService $notificationService,
    ) {}

    /**
     * Active company members who can be picked as observers.
     *
     * @return Collection<int, User>
     */
    public function listCandidates(User $user, ?int $companyId = null): Collection
    {
        $context = $this->accessService->resolve($user, $companyId);

        return app(OrganizationAgentRoster::class)
            ->assignableQuery((int) $context->company->id)
            ->addSelect(['users.avatar', 'users.gender'])
            ->orderBy('users.name')
            ->get();
    }

    /**
     * Replace the task's observers with the given users.
     * Current assignees are dropped from the list: they perform the task.
     *
     * @param  array<int, int|string>  $observerIds
     * @return array<int, int> ids of users newly added as observers
     */
    public function sync(Task $task, User $actor, array $observerIds): array
    {
        $requested = collect($observerIds)
            ->map(static fn (mixed $id): int => (int) $id)
            ->filter(static fn (int $id): bool => $id > 0)
            ->unique()
            ->values();

        $assigneeIds = $this->assigneeIds($task);
        $requested = $requested->reject(static fn (int $id): bool => in_array($id, $assigneeIds, true))->values();

        if ($requested->isNotEmpty()) {
            $memberIds = app(OrganizationAgentRoster::class)
                ->assignableQuery((int) $task->company_id)
                ->whereIn('users.id', $requested->all())
                ->pluck('users.id')
                ->map(static fn (mixed $id): int => (int) $id)
                ->all();

            if (count($memberIds) !== $requested->count()) {
                throw ValidationException::withMessages([
                    'observer_ids' => ['Every observer must be an active member of this company.'],
                ]);
            }
        }

        $existing = DB::table('task_observers')
            ->where('task_id', $task->id)
            ->pluck('user_id')
            ->map(static fn (mixed $id): int => (int) $id)
            ->all();

        $added = $requested->diff($existing)->values()->all();
        $removed = array_values(array_diff($existing, $requested->all()));

        if ($removed !== []) {
            DB::table('task_observers')
                ->where('task_id', $task->id)
                ->whereIn('user_id', $removed)
                ->delete();
        }

        if ($added !== []) {
            $now = now();
            DB::table('task_observers')->insert(array_map(
                static fn (int $userId): array => [
                    'task_id' => $task->id,
                    'user_id' => $userId,
                    'added_by_user_id' => $actor->id,
                    'created_at' => $now,
                    'updated_at' => $now,
                ],
                $added,
            ));
        }

        $task->unsetRelation('observers');

        return $added;
    }

    public function isObserver(Task $task, User $user): bool
    {
        if ($task->relationLoaded('observers')) {
            return $task->observers->contains('id', (int) $user->id);
        }

        return DB::table('task_observers')
            ->where('task_id', $task->id)
            ->where('user_id', $user->id)
            ->exists();
    }

    /**
     * @param  array<int, int>  $userIds
     */
    public function notifyAdded(Task $task, User $actor, array $userIds): void
    {
        $userIds = array_values(array_filter($userIds, static fn (int $id): bool => $id !== (int) $actor->id));

        if ($userIds === []) {
            return;
        }

        foreach (User::query()->whereIn('id', $userIds)->get() as $observer) {
            $this->notificationService->notifyUser((int) $observer->id, [
                'company_id' => (int) $task->company_id,
                'type' => 'task.observer_added',
                'category' => NotificationCategory::TASK->value,
                'title' => 'You are observing a task',
                'message' => "{$actor->name} added you as an observer on task '{$task->title}'.",
                'reference_type' => Task::class,
                'reference_id' => (int) $task->id,
                'action_url' => '/tasks/'.$task->id,
                'action_route' => 'tasks.show',
                'priority' => NotificationPriority::NORMAL->value,
                'created_by_user_id' => (int) $actor->id,
                'metadata' => [
                    'task_id' => (int) $task->id,
                    'task_status' => $task->status?->value,
                    'observer' => true,
                ],
                'dedupe_key' => 'task-observer:'.$task->id.':'.$observer->id.':'.now()->timestamp,
            ]);

            try {
                $observer->notify(new TaskObserverAddedNotification(
                    taskId: (int) $task->id,
                    taskTitle: (string) $task->title,
                    addedByName: (string) $actor->name,
                    dueAt: $task->due_at?->toIso8601String(),
                ));
            } catch (Throwable $e) {
                Log::error('Task observer notification delivery failed.', [
                    'task_id' => $task->id,
                    'observer_id' => $observer->id,
                    'actor_id' => $actor->id,
                    'exception' => $e::class,
                    'message' => $e->getMessage(),
                ]);
            }
        }
    }

    /**
     * Tell everyone involved in the task, except the author, that a comment was posted:
     * observers, current assignees and the task creator.
     */
    public function notifyComment(Task $task, User $author, TaskComment $comment): void
    {
        $observerIds = DB::table('task_observers')
            ->where('task_id', $task->id)
            ->pluck('user_id')
            ->map(static fn (mixed $id): int => (int) $id)
            ->all();

        $recipientIds = collect([...$observerIds, ...$this->assigneeIds($task), (int) $task->created_by_user_id])
            ->filter(static fn (int $id): bool => $id > 0 && $id !== (int) $author->id)
            ->unique()
            ->values()
            ->all();

        $preview = mb_strimwidth((string) $comment->body, 0, 140, '…');

        foreach ($recipientIds as $recipientId) {
            $this->notificationService->notifyUser($recipientId, [
                'company_id' => (int) $task->company_id,
                'type' => 'task.comment_added',
                'category' => NotificationCategory::TASK->value,
                'title' => 'New comment on a task',
                'message' => "{$author->name} commented on '{$task->title}': {$preview}",
                'reference_type' => Task::class,
                'reference_id' => (int) $task->id,
                'action_url' => '/tasks/'.$task->id,
                'action_route' => 'tasks.show',
                'priority' => NotificationPriority::NORMAL->value,
                'created_by_user_id' => (int) $author->id,
                'metadata' => [
                    'task_id' => (int) $task->id,
                    'comment_id' => (int) $comment->id,
                    'observer' => in_array($recipientId, $observerIds, true),
                ],
                'dedupe_key' => 'task-comment:'.$comment->id.':'.$recipientId,
            ]);
        }
    }

    /**
     * @return array<int, int>
     */
    private function assigneeIds(Task $task): array
    {
        return DB::table('task_assignments')
            ->where('task_id', $task->id)
            ->where('is_current', true)
            ->pluck('assigned_agent_id')
            ->push($task->assigned_agent_id)
            ->map(static fn (mixed $id): int => (int) $id)
            ->filter(static fn (int $id): bool => $id > 0)
            ->unique()
            ->values()
            ->all();
    }
}
