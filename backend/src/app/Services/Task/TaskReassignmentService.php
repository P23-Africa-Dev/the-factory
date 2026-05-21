<?php

declare(strict_types=1);

namespace App\Services\Task;

use App\Enums\TaskStatus;
use App\Enums\TaskReassignmentStatus;
use App\Models\Task;
use App\Models\TaskAssignment;
use App\Models\TaskReassignment;
use App\Models\TaskTrackingSession;
use App\Models\User;
use App\Notifications\TaskReassignmentRequestedNotification;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

class TaskReassignmentService
{
    public function __construct(private readonly TaskAccessService $taskAccessService) {}

    public function request(
        User $user,
        Task $task,
        int $toUserId,
        ?int $companyId = null,
        ?string $reason = null,
    ): TaskReassignment {
        $context = $this->taskAccessService->resolve($user, $companyId);
        $this->assertTaskInCompany($task, (int) $context->company->id);

        $fromUserId = $this->resolveCurrentOwnerId($task);
        $this->ensureRequestPermission($context->role, (int) $user->id, $fromUserId);

        if (in_array($task->status?->value, [TaskStatus::COMPLETED->value, TaskStatus::CANCELLED->value], true)) {
            throw ValidationException::withMessages([
                'task' => ['Terminal tasks cannot be reassigned.'],
            ]);
        }

        if ($toUserId === $fromUserId) {
            throw ValidationException::withMessages([
                'to_user_id' => ['You must select a different user for reassignment.'],
            ]);
        }

        $targetRole = $this->resolveMembershipRole((int) $context->company->id, $toUserId);
        if ($targetRole === null) {
            throw ValidationException::withMessages([
                'to_user_id' => ['Selected user is not a member of this company.'],
            ]);
        }

        $this->ensureTargetRoleAllowed($context->role, $targetRole);

        $reassignment = DB::transaction(function () use ($context, $user, $task, $toUserId, $reason, $fromUserId): TaskReassignment {
            TaskReassignment::query()
                ->where('task_id', $task->id)
                ->where('status', TaskReassignmentStatus::PENDING->value)
                ->update([
                    'status' => TaskReassignmentStatus::CANCELLED->value,
                    'cancelled_at' => now(),
                    'responded_by_user_id' => $user->id,
                    'responded_at' => now(),
                    'updated_at' => now(),
                ]);

            return TaskReassignment::query()->create([
                'task_id' => $task->id,
                'company_id' => $context->company->id,
                'requested_by_user_id' => $user->id,
                'from_user_id' => $fromUserId,
                'to_user_id' => $toUserId,
                'status' => TaskReassignmentStatus::PENDING->value,
                'reason' => $reason,
                'requested_at' => now(),
                'action_token' => (string) Str::uuid(),
                'expires_at' => now()->addDays(7),
            ]);
        });

        $task->loadMissing('project');
        $toUser = User::query()->findOrFail($toUserId);
        $currentOwner = User::query()->find($fromUserId);

        if ($currentOwner !== null) {
            try {
                $toUser->notify(new TaskReassignmentRequestedNotification(
                    reassignment: $reassignment,
                    task: $task,
                    currentOwnerName: (string) $currentOwner->name,
                ));
            } catch (Throwable $exception) {
                Log::error('Task reassignment notification delivery failed.', [
                    'task_id' => $task->id,
                    'company_id' => $task->company_id,
                    'reassignment_id' => $reassignment->id,
                    'target_user_id' => $toUser->id,
                    'requested_by_user_id' => $user->id,
                    'exception' => $exception::class,
                    'message' => $exception->getMessage(),
                ]);
            }
        }

        return $this->loadReassignment($reassignment);
    }

    public function inbox(User $user, ?int $companyId = null, ?string $status = null): Collection
    {
        $context = $this->taskAccessService->resolve($user, $companyId);

        $query = TaskReassignment::query()
            ->where('company_id', $context->company->id)
            ->where('to_user_id', $user->id)
            ->with([
                'task:id,project_id,title,due_at,location_text,address_full',
                'task.project:id,name',
                'fromUser:id,name,email',
                'toUser:id,name,email',
                'requestedBy:id,name,email',
                'respondedBy:id,name,email',
            ])
            ->latest('id');

        if (! empty($status)) {
            $query->where('status', $status);
        }

        return $query->get();
    }

    public function accept(User $user, TaskReassignment $reassignment, ?int $companyId = null, ?string $responseNote = null): TaskReassignment
    {
        $context = $this->taskAccessService->resolve($user, $companyId);
        $acceptedReassignment = DB::transaction(function () use ($user, $reassignment, $responseNote, $context): TaskReassignment {
            /** @var TaskReassignment $lockedReassignment */
            $lockedReassignment = TaskReassignment::query()
                ->whereKey($reassignment->id)
                ->lockForUpdate()
                ->firstOrFail();

            if ((int) $lockedReassignment->company_id !== (int) $context->company->id) {
                throw ValidationException::withMessages([
                    'reassignment' => ['Reassignment does not belong to the active company context.'],
                ]);
            }

            $canRespond = (int) $lockedReassignment->to_user_id === (int) $user->id || $context->canManageTasks();
            if (! $canRespond) {
                throw ValidationException::withMessages([
                    'authorization' => ['Only the reassignment recipient can accept this request.'],
                ]);
            }

            if ($lockedReassignment->status?->value === TaskReassignmentStatus::ACCEPTED->value) {
                return $lockedReassignment;
            }

            if ($lockedReassignment->status?->value !== TaskReassignmentStatus::PENDING->value) {
                throw ValidationException::withMessages([
                    'status' => ['Only pending reassignment requests can be accepted.'],
                ]);
            }

            if ($lockedReassignment->expires_at !== null && $lockedReassignment->expires_at->isPast()) {
                throw ValidationException::withMessages([
                    'status' => ['This reassignment request has expired.'],
                ]);
            }

            $task = Task::query()->lockForUpdate()->findOrFail($lockedReassignment->task_id);
            $transferTimestamp = now();

            TaskTrackingSession::query()
                ->where('task_id', $task->id)
                ->whereNull('end_recorded_at')
                ->get()
                ->each(function (TaskTrackingSession $session) use ($lockedReassignment, $transferTimestamp): void {
                    $session->update([
                        'completed_by_user_id' => $lockedReassignment->from_user_id,
                        'end_latitude' => $session->last_latitude ?? $session->start_latitude,
                        'end_longitude' => $session->last_longitude ?? $session->start_longitude,
                        'end_accuracy_meters' => $session->last_accuracy_meters,
                        'end_recorded_at' => $session->last_recorded_at ?? $transferTimestamp,
                    ]);
                });

            TaskAssignment::query()
                ->where('task_id', $task->id)
                ->where('is_current', true)
                ->update([
                    'is_current' => false,
                    'unassigned_at' => $transferTimestamp,
                    'updated_at' => $transferTimestamp,
                ]);

            TaskAssignment::query()->create([
                'task_id' => $task->id,
                'assigned_by_user_id' => $lockedReassignment->requested_by_user_id,
                'assigned_agent_id' => $lockedReassignment->to_user_id,
                'assigned_at' => $transferTimestamp,
                'is_current' => true,
            ]);

            $task->update([
                'assigned_agent_id' => $lockedReassignment->to_user_id,
                'updated_at' => $transferTimestamp,
            ]);

            TaskReassignment::query()
                ->where('task_id', $task->id)
                ->where('status', TaskReassignmentStatus::PENDING->value)
                ->where('id', '!=', $lockedReassignment->id)
                ->update([
                    'status' => TaskReassignmentStatus::CANCELLED->value,
                    'cancelled_at' => $transferTimestamp,
                    'responded_by_user_id' => $user->id,
                    'responded_at' => $transferTimestamp,
                    'updated_at' => $transferTimestamp,
                ]);

            $lockedReassignment->update([
                'status' => TaskReassignmentStatus::ACCEPTED->value,
                'response_note' => $responseNote,
                'responded_by_user_id' => $user->id,
                'responded_at' => $transferTimestamp,
                'accepted_at' => $transferTimestamp,
                'tracking_transferred_at' => $transferTimestamp,
            ]);

            $this->publishReassignmentEvent($task, $lockedReassignment, $user->id, $transferTimestamp);

            return $lockedReassignment;
        });

        return $this->loadReassignment($acceptedReassignment->fresh());
    }

    public function reject(User $user, TaskReassignment $reassignment, ?int $companyId = null, ?string $responseNote = null): TaskReassignment
    {
        $context = $this->taskAccessService->resolve($user, $companyId);

        if ((int) $reassignment->company_id !== (int) $context->company->id) {
            throw ValidationException::withMessages([
                'reassignment' => ['Reassignment does not belong to the active company context.'],
            ]);
        }

        if ((int) $reassignment->to_user_id !== (int) $user->id) {
            throw ValidationException::withMessages([
                'authorization' => ['Only the reassignment recipient can reject this request.'],
            ]);
        }

        if ($reassignment->status?->value !== TaskReassignmentStatus::PENDING->value) {
            throw ValidationException::withMessages([
                'status' => ['Only pending reassignment requests can be rejected.'],
            ]);
        }

        $reassignment->update([
            'status' => TaskReassignmentStatus::REJECTED->value,
            'response_note' => $responseNote,
            'responded_by_user_id' => $user->id,
            'responded_at' => now(),
            'rejected_at' => now(),
        ]);

        return $this->loadReassignment($reassignment->fresh());
    }

    private function loadReassignment(TaskReassignment $reassignment): TaskReassignment
    {
        return $reassignment->load([
            'task:id,project_id,title,due_at,location_text,address_full',
            'task.project:id,name',
            'fromUser:id,name,email',
            'toUser:id,name,email',
            'requestedBy:id,name,email',
            'respondedBy:id,name,email',
        ]);
    }

    private function resolveCurrentOwnerId(Task $task): int
    {
        if ($task->assigned_agent_id !== null) {
            return (int) $task->assigned_agent_id;
        }

        $ownerId = TaskAssignment::query()
            ->where('task_id', $task->id)
            ->where('is_current', true)
            ->value('assigned_agent_id');

        if ($ownerId === null) {
            throw ValidationException::withMessages([
                'task' => ['Task does not have an active owner.'],
            ]);
        }

        return (int) $ownerId;
    }

    private function ensureRequestPermission(string $role, int $actorUserId, int $currentOwnerId): void
    {
        $isManagerRole = in_array($role, ['owner', 'admin', 'supervisor'], true);

        if (! $isManagerRole && $actorUserId !== $currentOwnerId) {
            throw ValidationException::withMessages([
                'authorization' => ['You do not have permission to request reassignment for this task.'],
            ]);
        }

        if ($role === 'agent' && $actorUserId !== $currentOwnerId) {
            throw ValidationException::withMessages([
                'authorization' => ['Agents can only request reassignment for tasks they currently own.'],
            ]);
        }
    }

    private function ensureTargetRoleAllowed(string $requesterRole, string $targetRole): void
    {
        if ($requesterRole === 'agent' && $targetRole !== 'agent') {
            throw ValidationException::withMessages([
                'to_user_id' => ['Agents can only reassign tasks to other agents.'],
            ]);
        }

        if ($requesterRole === 'supervisor' && ! in_array($targetRole, ['agent', 'supervisor'], true)) {
            throw ValidationException::withMessages([
                'to_user_id' => ['Supervisors can only reassign tasks to agents or supervisors.'],
            ]);
        }

        if (in_array($requesterRole, ['owner', 'admin'], true) && ! in_array($targetRole, ['agent', 'supervisor'], true)) {
            throw ValidationException::withMessages([
                'to_user_id' => ['Management can only reassign tasks to agents or supervisors.'],
            ]);
        }
    }

    private function resolveMembershipRole(int $companyId, int $userId): ?string
    {
        return DB::table('company_users')
            ->where('company_id', $companyId)
            ->where('user_id', $userId)
            ->value('role');
    }

    private function assertTaskInCompany(Task $task, int $companyId): void
    {
        if ((int) $task->company_id !== $companyId) {
            throw ValidationException::withMessages([
                'task' => ['Task does not belong to the active company context.'],
            ]);
        }
    }

    private function publishReassignmentEvent(Task $task, TaskReassignment $reassignment, int $actorUserId, Carbon $occurredAt): void
    {
        $prefix = (string) config('tracking.redis_channel_prefix', 'factory23.tracking');

        $payload = [
            'event' => 'tracking.task.reassigned',
            'version' => 1,
            'company_id' => (int) $task->company_id,
            'task_id' => (int) $task->id,
            'tracking_session_id' => null,
            'user_id' => $actorUserId,
            'occurred_at' => $occurredAt->toIso8601String(),
            'data' => [
                'reassignment_id' => (int) $reassignment->id,
                'from_user_id' => (int) $reassignment->from_user_id,
                'to_user_id' => (int) $reassignment->to_user_id,
                'status' => $reassignment->status?->value,
            ],
        ];

        $encoded = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($encoded === false) {
            return;
        }

        $channels = [
            "{$prefix}.company.{$task->company_id}",
            "{$prefix}.task.{$task->id}",
        ];

        foreach ($channels as $channel) {
            try {
                Redis::publish($channel, $encoded);
            } catch (Throwable $exception) {
                Log::warning('Task reassignment realtime publish failed.', [
                    'channel' => $channel,
                    'task_id' => $task->id,
                    'reassignment_id' => $reassignment->id,
                    'exception' => $exception::class,
                    'message' => $exception->getMessage(),
                ]);
            }
        }
    }
}
