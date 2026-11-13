<?php

declare(strict_types=1);

namespace App\Services\Task;

use App\Enums\NotificationCategory;
use App\Enums\NotificationPriority;
use App\Enums\TaskStatus;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskAssignment;
use App\Models\TaskProof;
use App\Models\User;
use App\Notifications\TaskAssignedNotification;
use App\Services\Notification\NotificationService;
use App\Services\Workforce\OrganizationAgentRoster;
use Carbon\Carbon;
use Illuminate\Contracts\Pagination\Paginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Throwable;

class TaskService
{
    private const ASSIGNABLE_ROLES = ['owner', 'admin', 'supervisor', 'agent'];

    private const INDEX_RELATIONS = [
        'project',
        'creator',
        'assignedAgent',
        'currentAssignees',
        'latestReassignment.requestedBy',
        'latestReassignment.fromUser',
        'latestReassignment.toUser',
        'latestReassignment.respondedBy',
        'subtasks.assignee',
        'subtasks.completer',
        'observers',
    ];

    private const DETAIL_RELATIONS = [
        'project',
        'creator',
        'assignedAgent',
        'currentAssignees',
        'latestReassignment.requestedBy',
        'latestReassignment.fromUser',
        'latestReassignment.toUser',
        'latestReassignment.respondedBy',
        'proofs.uploader',
        'subtasks.assignee',
        'subtasks.completer',
        'observers',
    ];

    public function __construct(
        private readonly TaskAccessService $accessService,
        private readonly NotificationService $notificationService,
    ) {}

    public function listForUser(User $user, array $filters): Paginator
    {
        $context = $this->accessService->resolve($user, $filters['company_id'] ?? null);

        $query = $this->queryForCompany($context->company->id)
            ->with(self::INDEX_RELATIONS)
            ->withCount(['proofs', 'comments'])
            ->latest('id');

        if (! empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        if (! empty($filters['priority'])) {
            $query->where('priority', $filters['priority']);
        }

        if (! empty($filters['type'])) {
            $query->where('type', $filters['type']);
        }

        if (! empty($filters['project_id'])) {
            $query->where('project_id', (int) $filters['project_id']);
        }

        if ($context->canManageTasks() && ! empty($filters['assigned_to_me'])) {
            $query->where(function (Builder $q) use ($user): void {
                $q->where('assigned_agent_id', $user->id)
                    ->orWhereHas('currentAssignees', function (Builder $assigneeQuery) use ($user): void {
                        $assigneeQuery->where('users.id', $user->id);
                    })
                    ->orWhereExists($this->observedBy($user));
            });
        } elseif ($context->isAgent()) {
            // Agents see currently owned tasks, historical tasks they previously owned,
            // and tasks where they are assigned a subtask.
            $query->where(function (Builder $q) use ($user): void {
                $q->where('assigned_agent_id', $user->id)
                    ->orWhereExists(function ($sub) use ($user): void {
                        $sub->selectRaw('1')
                            ->from('task_assignments')
                            ->whereColumn('task_assignments.task_id', 'tasks.id')
                            ->where('task_assignments.assigned_agent_id', $user->id)
                            ->where('task_assignments.is_current', true);
                    })
                    ->orWhereExists(function ($sub) use ($user): void {
                        $sub->selectRaw('1')
                            ->from('task_assignments as historical_task_assignments')
                            ->whereColumn('historical_task_assignments.task_id', 'tasks.id')
                            ->where('historical_task_assignments.assigned_agent_id', $user->id);
                    })
                    ->orWhereExists(function ($sub) use ($user): void {
                        $sub->selectRaw('1')
                            ->from('task_subtasks')
                            ->whereColumn('task_subtasks.task_id', 'tasks.id')
                            ->where('task_subtasks.assigned_user_id', $user->id);
                    })
                    ->orWhereExists($this->observedBy($user));
            });
        }

        return $query->simplePaginate(20)->withQueryString();
    }

    /**
     * @return Collection<int, User>
     */
    public function listAssignableUsers(User $user, ?int $companyId = null): Collection
    {
        $context = $this->accessService->resolve($user, $companyId);
        $this->accessService->ensureManager($context);

        return app(OrganizationAgentRoster::class)
            ->assignableQuery((int) $context->company->id)
            ->orderBy('company_users.role')
            ->orderBy('users.name')
            ->get();
    }

    public function create(User $user, array $data): Task
    {
        $context = $this->accessService->resolve($user, $data['company_id'] ?? null);
        $this->accessService->ensureManager($context);

        $agentIds = [];
        if (! empty($data['assigned_agent_ids'])) {
            $agentIds = array_map('intval', $data['assigned_agent_ids']);
        } elseif (isset($data['assigned_agent_id'])) {
            $agentIds = [(int) $data['assigned_agent_id']];
        }

        foreach ($agentIds as $agentId) {
            $this->ensureAssigneeBelongsToCompany($context->company->id, $agentId, $user);
        }

        if (! empty($data['project_id'])) {
            $this->ensureProjectBelongsToCompany($context->company->id, (int) $data['project_id']);
        }

        $primaryAgentId = $agentIds[0] ?? null;

        $addedObserverIds = [];

        $task = DB::transaction(function () use ($context, $user, $data, $agentIds, $primaryAgentId, &$addedObserverIds): Task {
            $latitude = isset($data['latitude']) ? (float) $data['latitude'] : null;
            $longitude = isset($data['longitude']) ? (float) $data['longitude'] : null;
            $trackable = (new Task([
                'latitude' => $latitude,
                'longitude' => $longitude,
            ]))->hasTrackableLocation();

            $operationalDefaults = $context->company->operationalDefaults();

            $task = Task::create([
                'company_id' => $context->company->id,
                'project_id' => $data['project_id'] ?? null,
                'created_by_user_id' => $user->id,
                'assigned_agent_id' => $primaryAgentId,
                'title' => $data['title'],
                'type' => $data['type'] ?? null,
                'description' => $data['description'] ?? null,
                'location_text' => $data['location'] ?? null,
                'address_full' => $data['address'] ?? null,
                'latitude' => $latitude,
                'longitude' => $longitude,
                'due_at' => $data['due_date'] ?? null,
                'required_actions' => $data['required_actions'] ?? [],
                'priority' => $data['priority'] ?? 'medium',
                'minimum_photos_required' => (int) ($data['minimum_photos_required'] ?? $operationalDefaults['minimum_photos_required']),
                'visit_verification_required' => $trackable && (bool) ($data['visit_verification_required'] ?? $operationalDefaults['visit_verification_required']),
                'status' => TaskStatus::PENDING->value,
            ]);

            foreach ($agentIds as $agentId) {
                TaskAssignment::create([
                    'task_id' => $task->id,
                    'assigned_by_user_id' => $user->id,
                    'assigned_agent_id' => $agentId,
                    'assigned_at' => now(),
                    'is_current' => true,
                ]);
            }

            if (! empty($data['subtasks']) && is_array($data['subtasks'])) {
                app(TaskSubtaskService::class)->createMany($task, $user, $data['subtasks']);
            }

            $addedObserverIds = app(TaskObserverService::class)->sync($task, $user, $data['observer_ids'] ?? []);

            return $this->loadTask($task, $context);
        });

        $this->notifyCurrentAssignees($task, $user, false);
        $this->notifyTaskAssignedInApp($task, $user, false);
        app(TaskObserverService::class)->notifyAdded($task, $user, $addedObserverIds);

        return $task;
    }

    public function createSelf(User $user, array $data): Task
    {
        unset($data['assigned_agent_id'], $data['assigned_agent_ids']);

        $context = $this->accessService->resolve($user, $data['company_id'] ?? null);
        $this->accessService->ensureAgent($context);

        if (! empty($data['project_id'])) {
            throw ValidationException::withMessages([
                'project_id' => ['Agent self tasks must be standalone and cannot be linked to a project.'],
            ]);
        }

        $addedObserverIds = [];

        $task = DB::transaction(function () use ($context, $user, $data, &$addedObserverIds): Task {
            $latitude = isset($data['latitude']) ? (float) $data['latitude'] : null;
            $longitude = isset($data['longitude']) ? (float) $data['longitude'] : null;
            $trackable = (new Task([
                'latitude' => $latitude,
                'longitude' => $longitude,
            ]))->hasTrackableLocation();

            $operationalDefaults = $context->company->operationalDefaults();

            $task = Task::create([
                'company_id' => $context->company->id,
                'project_id' => null,
                'created_by_user_id' => $user->id,
                'assigned_agent_id' => $user->id,
                'title' => $data['title'],
                'type' => $data['type'] ?? null,
                'description' => $data['description'] ?? null,
                'location_text' => $data['location'] ?? null,
                'address_full' => $data['address'] ?? null,
                'latitude' => $latitude,
                'longitude' => $longitude,
                'due_at' => $data['due_date'] ?? null,
                'required_actions' => $data['required_actions'] ?? [],
                'priority' => $data['priority'] ?? 'medium',
                'minimum_photos_required' => (int) ($data['minimum_photos_required'] ?? $operationalDefaults['minimum_photos_required']),
                'visit_verification_required' => $trackable && (bool) ($data['visit_verification_required'] ?? $operationalDefaults['visit_verification_required']),
                'status' => TaskStatus::PENDING->value,
            ]);

            TaskAssignment::create([
                'task_id' => $task->id,
                'assigned_by_user_id' => $user->id,
                'assigned_agent_id' => $user->id,
                'assigned_at' => now(),
                'is_current' => true,
            ]);

            if (! empty($data['subtasks']) && is_array($data['subtasks'])) {
                app(TaskSubtaskService::class)->createMany($task, $user, $data['subtasks'], selfAssignedFlow: true);
            }

            $addedObserverIds = app(TaskObserverService::class)->sync($task, $user, $data['observer_ids'] ?? []);

            return $this->loadTask($task, $context);
        });

        $this->notifyCurrentAssignees($task, $user, true);
        $this->notifyTaskAssignedInApp($task, $user, true);
        app(TaskObserverService::class)->notifyAdded($task, $user, $addedObserverIds);

        return $task;
    }

    public function update(User $user, Task $task, array $data): Task
    {
        $context = $this->accessService->resolve($user, $data['company_id'] ?? null);
        $this->assertTaskIntegrityInCompany($task, $context->company->id);

        if (! $this->canMutateTask($context, $user, $task)) {
            throw ValidationException::withMessages([
                'authorization' => ['You can only edit tasks assigned to you.'],
            ]);
        }

        if (! $context->canManageTasks()) {
            unset($data['project_id'], $data['assigned_agent_id'], $data['assigned_agent_ids']);

            // Agents may only manage observers on tasks they created themselves.
            if ((int) $task->created_by_user_id !== (int) $user->id) {
                unset($data['observer_ids']);
            }
        }

        if (! empty($data['project_id']) && $context->canManageTasks()) {
            $this->ensureProjectBelongsToCompany($context->company->id, (int) $data['project_id']);
        }

        if (array_key_exists('assigned_agent_ids', $data)) {
            if ($this->isTerminalStatus($task->status?->value)) {
                throw ValidationException::withMessages([
                    'assigned_agent_ids' => ['Assignees cannot be changed on a completed or cancelled task.'],
                ]);
            }

            foreach (array_map('intval', $data['assigned_agent_ids']) as $agentId) {
                $this->ensureAssigneeBelongsToCompany($context->company->id, $agentId, $user);
            }
        }

        if (array_key_exists('due_date', $data) && $data['due_date'] !== null) {
            $this->assertTaskDueDateNotBeforeSubtasks($task, $data['due_date']);
        }

        $addedObserverIds = [];
        $addedAssigneeIds = [];

        $updatedTask = DB::transaction(function () use ($task, $data, $context, $user, &$addedObserverIds, &$addedAssigneeIds): Task {
            $latitude = array_key_exists('latitude', $data)
                ? ($data['latitude'] !== null ? (float) $data['latitude'] : null)
                : $task->latitude;
            $longitude = array_key_exists('longitude', $data)
                ? ($data['longitude'] !== null ? (float) $data['longitude'] : null)
                : $task->longitude;
            $trackable = (new Task([
                'latitude' => $latitude,
                'longitude' => $longitude,
            ]))->hasTrackableLocation();

            $payload = array_filter([
                'title' => $data['title'] ?? null,
                'type' => $data['type'] ?? null,
                'description' => $data['description'] ?? null,
                'location_text' => $data['location'] ?? null,
                'address_full' => $data['address'] ?? null,
                'latitude' => $latitude,
                'longitude' => $longitude,
                'due_at' => $data['due_date'] ?? null,
                'required_actions' => $data['required_actions'] ?? null,
                'priority' => $data['priority'] ?? null,
                'minimum_photos_required' => array_key_exists('minimum_photos_required', $data)
                    ? (int) $data['minimum_photos_required']
                    : null,
                'visit_verification_required' => array_key_exists('visit_verification_required', $data)
                    ? ($trackable && (bool) $data['visit_verification_required'])
                    : null,
            ], static fn (mixed $value): bool => $value !== null);

            // Description is optional, so an explicit empty value clears it.
            if (array_key_exists('description', $data) && $data['description'] === null) {
                $payload['description'] = null;
            }

            if ($payload !== []) {
                $task->update($payload);
            }

            // Assignees first: observer sync drops anyone who now performs the task.
            if (array_key_exists('assigned_agent_ids', $data)) {
                $addedAssigneeIds = $this->syncAssignees($task, $user, array_map('intval', $data['assigned_agent_ids']));
            }

            if (array_key_exists('observer_ids', $data)) {
                $addedObserverIds = app(TaskObserverService::class)->sync($task, $user, $data['observer_ids'] ?? []);
            }

            return $this->loadTask($task, $context);
        });

        if ($addedAssigneeIds !== []) {
            $this->notifyCurrentAssignees($updatedTask, $user, false, $addedAssigneeIds);
            $this->notifyTaskAssignedInApp($updatedTask, $user, false, 'task.assigned', $addedAssigneeIds);
        }

        app(TaskObserverService::class)->notifyAdded($updatedTask, $user, $addedObserverIds);

        return $updatedTask;
    }

    public function delete(User $user, Task $task, ?int $companyId = null): void
    {
        $context = $this->accessService->resolve($user, $companyId);
        $this->assertTaskIntegrityInCompany($task, $context->company->id);

        if (! $this->canMutateTask($context, $user, $task)) {
            throw ValidationException::withMessages([
                'authorization' => ['You can only delete tasks assigned to you.'],
            ]);
        }

        DB::transaction(function () use ($task): void {
            $task->proofs()->delete();
            $task->trackingPoints()->delete();
            $task->trackingSession()->delete();
            $task->reassignments()->delete();
            $task->assignments()->delete();
            $task->delete();
        });
    }

    public function reassign(User $user, Task $task, array $agentIds, ?int $companyId = null): Task
    {
        $context = $this->accessService->resolve($user, $companyId);
        $this->accessService->ensureManager($context);
        $this->assertTaskIntegrityInCompany($task, $context->company->id);

        foreach ($agentIds as $agentId) {
            $this->ensureAssigneeBelongsToCompany($context->company->id, $agentId, $user);
        }

        if ($this->isTerminalStatus($task->status?->value)) {
            throw ValidationException::withMessages([
                'task' => ['Terminal tasks cannot be reassigned.'],
            ]);
        }

        $updatedTask = DB::transaction(function () use ($task, $agentIds, $user, $context): Task {
            TaskAssignment::where('task_id', $task->id)
                ->where('is_current', true)
                ->update(['is_current' => false, 'unassigned_at' => now()]);

            foreach ($agentIds as $agentId) {
                TaskAssignment::create([
                    'task_id' => $task->id,
                    'assigned_by_user_id' => $user->id,
                    'assigned_agent_id' => $agentId,
                    'assigned_at' => now(),
                    'is_current' => true,
                ]);
            }

            // assigned_agent_id holds primary agent (first in list)
            $task->update(['assigned_agent_id' => $agentIds[0]]);

            return $this->loadTask($task, $context);
        });

        $this->notifyTaskAssignedInApp($updatedTask, $user, false, 'task.reassigned');

        return $updatedTask;
    }

    public function updateStatus(User $user, Task $task, string $status, ?int $companyId = null): Task
    {
        $context = $this->accessService->resolve($user, $companyId);
        $this->accessService->ensureAgent($context);
        $this->assertTaskIntegrityInCompany($task, $context->company->id);

        if (! $this->isUserAssignedToTask($task, $user)) {
            throw ValidationException::withMessages([
                'authorization' => ['You can only update tasks assigned to you.'],
            ]);
        }

        $current = $task->status?->value;

        if ($this->isLockedTerminalStatus($current)) {
            throw ValidationException::withMessages([
                'status' => ['Terminal tasks cannot be changed.'],
            ]);
        }

        $this->assertValidStatusTransition($current, $status);

        // Photo uploads are optional; minimum_photos_required is a hint only.
        // Visit verification stays an opt-in check per task.
        if ($status === TaskStatus::COMPLETED->value) {
            if ($task->visit_verification_required) {
                $hasGpsProof = $task->proofs()
                    ->whereNotNull('latitude')
                    ->whereNotNull('longitude')
                    ->exists();

                if (! $hasGpsProof) {
                    throw ValidationException::withMessages([
                        'status' => ['A GPS-verified proof is required to complete this task.'],
                    ]);
                }
            }
        }

        if ($current !== $status) {
            $task->update($this->buildStatusUpdatePayload($task, $user->id, $status));
        }

        $loadedTask = $this->loadTask($task, $context);
        $this->notifyTaskStatusChanged($loadedTask, $user, $status);

        return $loadedTask;
    }

    public function updateStatusForManager(User $user, Task $task, string $status, ?int $companyId = null): Task
    {
        $context = $this->accessService->resolve($user, $companyId);
        $this->accessService->ensureManager($context);
        $this->assertTaskIntegrityInCompany($task, $context->company->id);

        $current = $task->status?->value;

        if ($this->isLockedTerminalStatus($current)) {
            throw ValidationException::withMessages([
                'status' => ['Terminal tasks cannot be changed.'],
            ]);
        }

        $this->assertValidStatusTransition($current, $status);

        if ($current !== $status) {
            $task->update($this->buildStatusUpdatePayload($task, $user->id, $status));
        }

        $loadedTask = $this->loadTask($task, $context);
        $this->notifyTaskStatusChanged($loadedTask, $user, $status);

        return $loadedTask;
    }

    public function uploadProof(User $user, Task $task, UploadedFile $file, array $data): TaskProof
    {
        $context = $this->accessService->resolve($user, $data['company_id'] ?? null);
        $this->accessService->ensureAgent($context);
        $this->assertTaskIntegrityInCompany($task, $context->company->id);

        if (! $this->isUserAssignedToTask($task, $user)) {
            throw ValidationException::withMessages([
                'authorization' => ['You can only upload proof for tasks assigned to you.'],
            ]);
        }

        if ($this->isTerminalStatus($task->status?->value)) {
            throw ValidationException::withMessages([
                'task' => ['Proof cannot be uploaded for terminal tasks.'],
            ]);
        }

        $disk = (string) config('filesystems.drive_disk', 'drive');
        $directory = "task-proofs/company-{$context->company->id}/task-{$task->id}";
        $path = Storage::disk($disk)->putFile($directory, $file, [
            'visibility' => 'private',
        ]);

        if (! is_string($path) || $path === '') {
            throw ValidationException::withMessages([
                'file' => ['Unable to store the uploaded proof file.'],
            ]);
        }

        $proof = TaskProof::create([
            'task_id' => $task->id,
            'uploaded_by_user_id' => $user->id,
            'disk' => $disk,
            'file_path' => $path,
            'mime_type' => (string) ($file->getMimeType() ?: 'application/octet-stream'),
            'size_bytes' => (int) $file->getSize(),
            'latitude' => $data['latitude'] ?? null,
            'longitude' => $data['longitude'] ?? null,
            'captured_at' => $data['captured_at'] ?? null,
            'notes' => $data['notes'] ?? null,
            'metadata' => [
                'original_name' => $file->getClientOriginalName(),
            ],
        ]);

        $this->notifyTaskProofUploaded($task, $user);

        if (app('router')->has('tasks.proofs.show')) {
            $proof->setAttribute(
                'file_url',
                route('tasks.proofs.show', [
                    'task' => $task->id,
                    'proof' => $proof->id,
                    'company_id' => $task->company_id,
                ])
            );
        }

        return $proof;
    }

    public function replaceProofFile(
        User $user,
        Task $task,
        TaskProof $proof,
        UploadedFile $file,
        array $data = [],
    ): TaskProof {
        $context = $this->accessService->resolve($user, $data['company_id'] ?? null);
        $this->assertTaskIntegrityInCompany($task, $context->company->id);

        if (! $context->canViewProofFiles()) {
            throw ValidationException::withMessages([
                'authorization' => ['Only owners and admins can replace proof files.'],
            ]);
        }

        if ((int) $proof->task_id !== (int) $task->id) {
            throw ValidationException::withMessages([
                'proof' => ['Proof does not belong to the selected task.'],
            ]);
        }

        $disk = (string) config('filesystems.drive_disk', 'drive');
        $directory = "task-proofs/company-{$context->company->id}/task-{$task->id}";
        $path = Storage::disk($disk)->putFile($directory, $file, [
            'visibility' => 'private',
        ]);

        if (! is_string($path) || $path === '') {
            throw ValidationException::withMessages([
                'file' => ['Unable to store the replacement proof file.'],
            ]);
        }

        $previousDisk = is_string($proof->disk) ? $proof->disk : null;
        $previousPath = is_string($proof->file_path) ? $proof->file_path : null;

        $metadata = is_array($proof->metadata) ? $proof->metadata : [];
        $metadata['original_name'] = $file->getClientOriginalName();

        $proof->update([
            'disk' => $disk,
            'file_path' => $path,
            'mime_type' => (string) ($file->getMimeType() ?: 'application/octet-stream'),
            'size_bytes' => (int) $file->getSize(),
            'notes' => array_key_exists('notes', $data) ? ($data['notes'] ?? null) : $proof->notes,
            'metadata' => $metadata,
        ]);

        if (
            $previousDisk
            && $previousPath
            && ($previousDisk !== $disk || $previousPath !== $path)
            && Storage::disk($previousDisk)->exists($previousPath)
        ) {
            Storage::disk($previousDisk)->delete($previousPath);
        }

        $proof->refresh();

        if (app('router')->has('tasks.proofs.show')) {
            $proof->setAttribute(
                'file_url',
                route('tasks.proofs.show', [
                    'task' => $task->id,
                    'proof' => $proof->id,
                    'company_id' => $task->company_id,
                ])
            );
        }

        return $proof;
    }

    public function findForUser(User $user, Task $task, ?int $companyId = null): Task
    {
        $context = $this->accessService->resolve($user, $companyId);
        $this->assertTaskIntegrityInCompany($task, $context->company->id);

        if ($context->isAgent() && ! $this->isUserRelatedToTask($task, $user)) {
            throw ValidationException::withMessages([
                'authorization' => ['You can only view tasks assigned to you.'],
            ]);
        }

        return $this->loadTask($task, $context, includeProofs: true);
    }

    public function findProofForDownload(User $user, Task $task, TaskProof $proof, ?int $companyId = null): TaskProof
    {
        $context = $this->accessService->resolve($user, $companyId);
        $this->assertTaskIntegrityInCompany($task, $context->company->id);

        if ((int) $proof->task_id !== (int) $task->id) {
            throw ValidationException::withMessages([
                'proof' => ['Proof does not belong to the selected task.'],
            ]);
        }

        if (! $context->canViewProofFiles()) {
            throw ValidationException::withMessages([
                'authorization' => ['Only owners and admins can view proof files.'],
            ]);
        }

        return $proof;
    }

    public function proofDownloadName(TaskProof $proof): string
    {
        $originalName = $proof->metadata['original_name'] ?? null;

        if (is_string($originalName) && $originalName !== '') {
            return $originalName;
        }

        return basename($proof->file_path);
    }

    private function ensureAssigneeBelongsToCompany(int $companyId, int $userId, ?User $creator = null): void
    {
        $membership = $this->companyMembership($companyId, $userId);
        $isActive = User::query()->whereKey($userId)->where('is_active', true)->exists();

        if (! $membership || ! $isActive || ! in_array((string) $membership->role, self::ASSIGNABLE_ROLES, true)) {
            throw ValidationException::withMessages([
                'assigned_agent_id' => ['Selected user is not a member of this company.'],
            ]);
        }

        if ($creator !== null) {
            $creatorMembership = $this->companyMembership($companyId, $creator->id);
            if ($creatorMembership && (string) $creatorMembership->role === 'supervisor') {
                $assigneeUser = User::query()->find($userId);
                if (! $assigneeUser || (int) $assigneeUser->supervisor_user_id !== (int) $creator->id) {
                    throw ValidationException::withMessages([
                        'assigned_agent_id' => ['You can only assign tasks to agents under your direct supervision.'],
                    ]);
                }
            }
        }
    }

    private function assertTaskIntegrityInCompany(Task $task, int $companyId): void
    {
        if ((int) $task->company_id !== $companyId) {
            throw ValidationException::withMessages([
                'task' => ['Task does not belong to the active company context.'],
            ]);
        }

        if ((int) $task->created_by_user_id <= 0 || ! $this->companyMembership($companyId, (int) $task->created_by_user_id)) {
            throw ValidationException::withMessages([
                'task' => ['Task creator is not a valid member of the active company context.'],
            ]);
        }

        // Validate assignee only when one is set.
        if ($task->assigned_agent_id !== null) {
            $assignedMembership = $this->companyMembership($companyId, (int) $task->assigned_agent_id);

            if (! $assignedMembership || ! in_array((string) $assignedMembership->role, self::ASSIGNABLE_ROLES, true)) {
                throw ValidationException::withMessages([
                    'task' => ['Task assignee is not a valid assignable user in the active company context.'],
                ]);
            }
        }

        if ($task->project_id !== null) {
            $this->ensureProjectBelongsToCompany($companyId, (int) $task->project_id);
        }
    }

    private function ensureProjectBelongsToCompany(int $companyId, int $projectId): void
    {
        $project = Project::query()->find($projectId);

        if (! $project || (int) $project->company_id !== $companyId) {
            throw ValidationException::withMessages([
                'project_id' => ['Selected project does not belong to the active company context.'],
            ]);
        }
    }

    public function reloadTaskForContext(Task $task, TaskAccessContext $context, bool $includeProofs = false): Task
    {
        return $this->loadTask($task, $context, $includeProofs);
    }

    /**
     * Recompute parent task status after a subtask completion set changes.
     *
     * @return array{status_changed: bool, completion_blocked_reason: ?string}
     */
    public function syncStatusFromSubtasks(Task $task, User $actor): array
    {
        $task->refresh();
        $total = $task->subtasks()->count();
        $done = $task->subtasks()->where('is_completed', true)->count();
        $current = $task->status?->value;
        $blockedReason = null;
        $nextStatus = null;

        if ($total === 0 || $current === TaskStatus::CANCELLED->value) {
            return [
                'status_changed' => false,
                'completion_blocked_reason' => null,
            ];
        }

        if ($done >= 1 && $done < $total && $current === TaskStatus::PENDING->value) {
            $nextStatus = TaskStatus::IN_PROGRESS->value;
        } elseif ($done === $total && $total > 0) {
            if (in_array($current, [
                TaskStatus::PENDING->value,
                TaskStatus::IN_PROGRESS->value,
                TaskStatus::PAUSED->value,
                TaskStatus::RESUMED->value,
            ], true)) {
                $blockedReason = $this->completionBlockedReason($task);
                if ($blockedReason !== null) {
                    if ($current === TaskStatus::PENDING->value) {
                        $nextStatus = TaskStatus::IN_PROGRESS->value;
                    }
                } else {
                    $nextStatus = TaskStatus::COMPLETED->value;
                }
            }
        } elseif ($done < $total && $current === TaskStatus::COMPLETED->value) {
            $nextStatus = TaskStatus::IN_PROGRESS->value;
        }

        if ($nextStatus === null || $nextStatus === $current) {
            return [
                'status_changed' => false,
                'completion_blocked_reason' => $blockedReason,
            ];
        }

        // Pending -> completed must pass through in_progress so started_at is set.
        if ($current === TaskStatus::PENDING->value && $nextStatus === TaskStatus::COMPLETED->value) {
            $task->update($this->buildStatusUpdatePayload($task, (int) $actor->id, TaskStatus::IN_PROGRESS->value));
            $task->refresh();
        }

        $task->update($this->buildStatusUpdatePayload($task, (int) $actor->id, $nextStatus));
        $task->refresh();
        $this->notifyTaskStatusChanged($task, $actor, $nextStatus);

        return [
            'status_changed' => true,
            'completion_blocked_reason' => $blockedReason,
        ];
    }

    private function completionBlockedReason(Task $task): ?string
    {
        if ($task->visit_verification_required) {
            $hasGpsProof = $task->proofs()
                ->whereNotNull('latitude')
                ->whereNotNull('longitude')
                ->exists();

            if (! $hasGpsProof) {
                return 'A GPS-verified proof is required to complete this task.';
            }
        }

        return null;
    }

    private function assertTaskDueDateNotBeforeSubtasks(Task $task, mixed $dueDate): void
    {
        $taskDue = Carbon::parse($dueDate);
        $latestSubtaskDue = $task->subtasks()
            ->whereNotNull('due_at')
            ->max('due_at');

        if ($latestSubtaskDue !== null && $taskDue->lt(Carbon::parse($latestSubtaskDue))) {
            throw ValidationException::withMessages([
                'due_date' => ['The task due date cannot be earlier than a subtask due date.'],
            ]);
        }
    }

    private function loadTask(Task $task, TaskAccessContext $context, bool $includeProofs = false): Task
    {
        $relations = $includeProofs ? self::DETAIL_RELATIONS : self::INDEX_RELATIONS;

        $task->load($relations)->loadCount(['proofs', 'comments']);

        if ($includeProofs && $task->relationLoaded('proofs')) {
            $task->proofs->each(function (TaskProof $proof) use ($task, $context): void {
                $proof->setAttribute(
                    'file_url',
                    $context->canViewProofFiles() && app('router')->has('tasks.proofs.show')
                        ? route('tasks.proofs.show', ['task' => $task->id, 'proof' => $proof->id, 'company_id' => $task->company_id])
                        : null
                );
            });
        }

        return $task;
    }

    private function queryForCompany(int $companyId): Builder
    {
        return Task::query()
            ->where('company_id', $companyId)
            ->whereExists(function ($query): void {
                $query->selectRaw('1')
                    ->from('company_users as creator_memberships')
                    ->whereColumn('creator_memberships.company_id', 'tasks.company_id')
                    ->whereColumn('creator_memberships.user_id', 'tasks.created_by_user_id');
            })
            ->where(function (Builder $query): void {
                // Allow unassigned tasks OR tasks with a valid current assignable user in the company.
                $query->whereNull('tasks.assigned_agent_id')
                    ->orWhereExists(function ($sub): void {
                        $sub->selectRaw('1')
                            ->from('company_users as assignee_memberships')
                            ->whereColumn('assignee_memberships.company_id', 'tasks.company_id')
                            ->whereColumn('assignee_memberships.user_id', 'tasks.assigned_agent_id')
                            ->whereIn('assignee_memberships.role', self::ASSIGNABLE_ROLES);
                    });
            })
            ->where(function (Builder $query): void {
                $query->whereNull('project_id')
                    ->orWhereExists(function ($projectQuery): void {
                        $projectQuery->selectRaw('1')
                            ->from('projects')
                            ->whereColumn('projects.id', 'tasks.project_id')
                            ->whereColumn('projects.company_id', 'tasks.company_id');
                    });
            });
    }

    private function companyMembership(int $companyId, int $userId): ?object
    {
        return DB::table('company_users')
            ->where('company_id', $companyId)
            ->where('user_id', $userId)
            ->first();
    }

    private function isUserAssignedToTask(Task $task, User $user): bool
    {
        if ((int) $task->assigned_agent_id === (int) $user->id) {
            return true;
        }

        return $task->assignments()
            ->where('assigned_agent_id', $user->id)
            ->where('is_current', true)
            ->exists();
    }

    private function isUserRelatedToTask(Task $task, User $user): bool
    {
        if ($this->isUserAssignedToTask($task, $user)) {
            return true;
        }

        if ($task->assignments()->where('assigned_agent_id', $user->id)->exists()) {
            return true;
        }

        if ($task->subtasks()->where('assigned_user_id', $user->id)->exists()) {
            return true;
        }

        return app(TaskObserverService::class)->isObserver($task, $user);
    }

    /**
     * Subquery matching tasks the user observes.
     */
    private function observedBy(User $user): \Closure
    {
        return static function ($sub) use ($user): void {
            $sub->selectRaw('1')
                ->from('task_observers')
                ->whereColumn('task_observers.task_id', 'tasks.id')
                ->where('task_observers.user_id', $user->id);
        };
    }

    private function canMutateTask(TaskAccessContext $context, User $user, Task $task): bool
    {
        if ($context->canManageTasks()) {
            return true;
        }

        return $context->isAgent() && $this->isUserAssignedToTask($task, $user);
    }

    /**
     * Replace the task's current assignees. Removed people keep their history row
     * (is_current = false); the first id becomes the primary assignee.
     *
     * @param  array<int, int>  $agentIds
     * @return array<int, int> ids of users newly assigned
     */
    private function syncAssignees(Task $task, User $actor, array $agentIds): array
    {
        $agentIds = array_values(array_unique(array_filter($agentIds, static fn (int $id): bool => $id > 0)));

        $currentIds = TaskAssignment::query()
            ->where('task_id', $task->id)
            ->where('is_current', true)
            ->pluck('assigned_agent_id')
            ->map(static fn (mixed $id): int => (int) $id)
            ->all();

        $removed = array_values(array_diff($currentIds, $agentIds));
        $added = array_values(array_diff($agentIds, $currentIds));

        if ($removed !== []) {
            TaskAssignment::query()
                ->where('task_id', $task->id)
                ->where('is_current', true)
                ->whereIn('assigned_agent_id', $removed)
                ->update(['is_current' => false, 'unassigned_at' => now()]);
        }

        foreach ($added as $agentId) {
            TaskAssignment::create([
                'task_id' => $task->id,
                'assigned_by_user_id' => $actor->id,
                'assigned_agent_id' => $agentId,
                'assigned_at' => now(),
                'is_current' => true,
            ]);
        }

        if ((int) $task->assigned_agent_id !== $agentIds[0]) {
            $task->update(['assigned_agent_id' => $agentIds[0]]);
        }

        // Someone who performs the task is no longer just an observer of it.
        DB::table('task_observers')
            ->where('task_id', $task->id)
            ->whereIn('user_id', $agentIds)
            ->delete();

        $task->unsetRelation('currentAssignees');
        $task->unsetRelation('assignedAgent');

        return $added;
    }

    /**
     * @param  array<int, int>|null  $onlyUserIds  limit to these assignees, e.g. people just added
     */
    private function notifyCurrentAssignees(Task $task, User $actor, bool $selfAssignedFlow, ?array $onlyUserIds = null): void
    {
        $assigneeIds = TaskAssignment::query()
            ->where('task_id', $task->id)
            ->where('is_current', true)
            ->pluck('assigned_agent_id')
            ->map(static fn (mixed $id): int => (int) $id)
            ->filter(static fn (int $id): bool => $id > 0)
            ->unique()
            ->values()
            ->all();

        if ($assigneeIds === [] && $task->assigned_agent_id !== null) {
            $assigneeIds = [(int) $task->assigned_agent_id];
        }

        if ($onlyUserIds !== null) {
            $assigneeIds = array_values(array_intersect($assigneeIds, $onlyUserIds));
        }

        if ($assigneeIds === []) {
            return;
        }

        $assignees = User::query()->whereIn('id', $assigneeIds)->get();

        foreach ($assignees as $assignee) {
            try {
                $assignee->notify(new TaskAssignedNotification(
                    taskId: (int) $task->id,
                    taskTitle: (string) $task->title,
                    assignedByName: (string) $actor->name,
                    dueAt: $task->due_at?->toIso8601String(),
                    projectName: $task->project?->name,
                    selfAssigned: $selfAssignedFlow && (int) $assignee->id === (int) $actor->id,
                ));
            } catch (Throwable $e) {
                Log::error('Task assignment notification delivery failed.', [
                    'task_id' => $task->id,
                    'company_id' => $task->company_id,
                    'assigned_user_id' => $assignee->id,
                    'assigned_user_email' => $assignee->email,
                    'actor_id' => $actor->id,
                    'exception' => $e::class,
                    'message' => $e->getMessage(),
                ]);
            }
        }
    }

    /**
     * @param  array<int, int>|null  $onlyUserIds  limit to these assignees, e.g. people just added
     */
    private function notifyTaskAssignedInApp(Task $task, User $actor, bool $selfAssignedFlow, string $eventType = 'task.assigned', ?array $onlyUserIds = null): void
    {
        $assigneeIds = TaskAssignment::query()
            ->where('task_id', $task->id)
            ->where('is_current', true)
            ->pluck('assigned_agent_id')
            ->map(static fn (mixed $id): int => (int) $id)
            ->filter(static fn (int $id): bool => $id > 0)
            ->unique()
            ->values()
            ->all();

        if ($assigneeIds === [] && $task->assigned_agent_id !== null) {
            $assigneeIds = [(int) $task->assigned_agent_id];
        }

        if ($onlyUserIds !== null) {
            $assigneeIds = array_values(array_intersect($assigneeIds, $onlyUserIds));
        }

        foreach ($assigneeIds as $assigneeId) {
            $selfAssigned = $selfAssignedFlow && $assigneeId === (int) $actor->id;

            $this->notificationService->notifyUser($assigneeId, [
                'company_id' => (int) $task->company_id,
                'type' => $eventType,
                'category' => NotificationCategory::TASK->value,
                'title' => $selfAssigned ? 'Self-task created' : 'New task assignment',
                'message' => $selfAssigned
                    ? "You created and assigned task '{$task->title}' to yourself."
                    : "{$actor->name} assigned task '{$task->title}' to you.",
                'reference_type' => Task::class,
                'reference_id' => (int) $task->id,
                'action_url' => '/tasks/'.$task->id,
                'action_route' => 'tasks.show',
                'priority' => NotificationPriority::HIGH->value,
                'created_by_user_id' => (int) $actor->id,
                'metadata' => [
                    'task_id' => (int) $task->id,
                    'task_status' => $task->status?->value,
                    'task_due_at' => $task->due_at?->toIso8601String(),
                    'self_assigned' => $selfAssigned,
                ],
                'dedupe_key' => 'task-assignment:'.$task->id.':'.$assigneeId.':'.($task->updated_at?->timestamp ?? now()->timestamp),
            ]);
        }
    }

    private function notifyTaskStatusChanged(Task $task, User $actor, string $status): void
    {
        $recipientIds = collect([
            (int) $task->created_by_user_id,
            (int) ($task->assigned_agent_id ?? 0),
        ])
            ->merge($this->managerUserIdsForCompany((int) $task->company_id))
            ->filter(static fn (int $id): bool => $id > 0)
            ->unique()
            ->reject(static fn (int $id): bool => $id === (int) $actor->id)
            ->values()
            ->all();

        foreach ($recipientIds as $recipientId) {
            $this->notificationService->notifyUser($recipientId, [
                'company_id' => (int) $task->company_id,
                'type' => 'task.status_changed',
                'category' => NotificationCategory::TASK->value,
                'title' => 'Task status updated',
                'message' => "Task '{$task->title}' is now {$status}.",
                'reference_type' => Task::class,
                'reference_id' => (int) $task->id,
                'action_url' => '/tasks/'.$task->id,
                'action_route' => 'tasks.show',
                'priority' => in_array($status, [TaskStatus::COMPLETED->value, TaskStatus::CANCELLED->value], true)
                    ? NotificationPriority::HIGH->value
                    : NotificationPriority::NORMAL->value,
                'created_by_user_id' => (int) $actor->id,
                'metadata' => [
                    'task_id' => (int) $task->id,
                    'task_status' => $status,
                    'updated_by_user_id' => (int) $actor->id,
                ],
                'dedupe_key' => 'task-status:'.$task->id.':'.$status.':'.($task->updated_at?->timestamp ?? now()->timestamp),
            ]);
        }
    }

    private function notifyTaskProofUploaded(Task $task, User $actor): void
    {
        $recipientIds = collect([
            (int) $task->created_by_user_id,
            (int) ($task->assigned_agent_id ?? 0),
        ])
            ->merge($this->managerUserIdsForCompany((int) $task->company_id))
            ->filter(static fn (int $id): bool => $id > 0)
            ->unique()
            ->reject(static fn (int $id): bool => $id === (int) $actor->id)
            ->values()
            ->all();

        foreach ($recipientIds as $recipientId) {
            $this->notificationService->notifyUser($recipientId, [
                'company_id' => (int) $task->company_id,
                'type' => 'task.proof_uploaded',
                'category' => NotificationCategory::TASK->value,
                'title' => 'Task proof uploaded',
                'message' => "{$actor->name} uploaded proof for task '{$task->title}'.",
                'reference_type' => Task::class,
                'reference_id' => (int) $task->id,
                'action_url' => '/tasks/'.$task->id,
                'action_route' => 'tasks.show',
                'priority' => NotificationPriority::NORMAL->value,
                'created_by_user_id' => (int) $actor->id,
                'metadata' => [
                    'task_id' => (int) $task->id,
                    'uploaded_by_user_id' => (int) $actor->id,
                ],
                'dedupe_key' => 'task-proof:'.$task->id.':'.($task->updated_at?->timestamp ?? now()->timestamp),
            ]);
        }
    }

    private function managerUserIdsForCompany(int $companyId): array
    {
        return DB::table('company_users')
            ->where('company_id', $companyId)
            ->whereIn('role', ['owner', 'admin', 'supervisor'])
            ->pluck('user_id')
            ->map(static fn (mixed $id): int => (int) $id)
            ->all();
    }

    private function buildStatusUpdatePayload(Task $task, int $updatedByUserId, string $nextStatus): array
    {
        $payload = [
            'status' => $nextStatus,
            'last_status_updated_by_user_id' => $updatedByUserId,
            'started_at' => $task->started_at,
            'paused_at' => $task->paused_at,
            'resumed_at' => $task->resumed_at,
            'completed_at' => null,
        ];

        if ($nextStatus === TaskStatus::PENDING->value) {
            $payload['started_at'] = null;
            $payload['paused_at'] = null;
            $payload['resumed_at'] = null;

            return $payload;
        }

        if ($nextStatus === TaskStatus::IN_PROGRESS->value) {
            $payload['started_at'] = $task->started_at ?? now();
            $payload['paused_at'] = null;
            $payload['resumed_at'] = null;

            return $payload;
        }

        if ($nextStatus === TaskStatus::PAUSED->value) {
            $payload['paused_at'] = now();

            return $payload;
        }

        if ($nextStatus === TaskStatus::RESUMED->value) {
            $payload['resumed_at'] = now();

            return $payload;
        }

        if ($nextStatus === TaskStatus::COMPLETED->value) {
            $payload['completed_at'] = now();

            return $payload;
        }

        return $payload;
    }

    private function assertValidStatusTransition(?string $currentStatus, string $nextStatus): void
    {
        if ($currentStatus === null) {
            throw ValidationException::withMessages([
                'status' => ['Task status is not initialized.'],
            ]);
        }

        if ($currentStatus === $nextStatus) {
            return;
        }

        $allowedTransitions = [
            TaskStatus::PENDING->value => [
                TaskStatus::IN_PROGRESS->value,
                TaskStatus::CANCELLED->value,
            ],
            TaskStatus::IN_PROGRESS->value => [
                TaskStatus::PENDING->value,
                TaskStatus::PAUSED->value,
                TaskStatus::COMPLETED->value,
                TaskStatus::CANCELLED->value,
            ],
            TaskStatus::PAUSED->value => [
                TaskStatus::IN_PROGRESS->value,
                TaskStatus::RESUMED->value,
                TaskStatus::PENDING->value,
                TaskStatus::COMPLETED->value,
                TaskStatus::CANCELLED->value,
            ],
            TaskStatus::RESUMED->value => [
                TaskStatus::IN_PROGRESS->value,
                TaskStatus::PAUSED->value,
                TaskStatus::PENDING->value,
                TaskStatus::COMPLETED->value,
                TaskStatus::CANCELLED->value,
            ],
            TaskStatus::COMPLETED->value => [
                TaskStatus::IN_PROGRESS->value,
                TaskStatus::PENDING->value,
            ],
            TaskStatus::CANCELLED->value => [],
        ];

        if (! in_array($nextStatus, $allowedTransitions[$currentStatus] ?? [], true)) {
            throw ValidationException::withMessages([
                'status' => ['Invalid task status transition.'],
            ]);
        }
    }

    private function isLockedTerminalStatus(?string $status): bool
    {
        return $status === TaskStatus::CANCELLED->value;
    }

    private function isTerminalStatus(?string $status): bool
    {
        return in_array($status, [TaskStatus::COMPLETED->value, TaskStatus::CANCELLED->value], true);
    }
}
