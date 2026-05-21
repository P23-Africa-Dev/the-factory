<?php

declare(strict_types=1);

namespace App\Services\Project;

use App\Enums\ProjectStatus;
use App\Enums\TaskStatus;
use App\Models\Project;
use App\Models\User;
use App\Services\Task\TaskAccessService;
use Carbon\Carbon;
use Illuminate\Contracts\Pagination\Paginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class ProjectService
{
    public function __construct(private readonly TaskAccessService $accessService) {}

    public function listForManager(User $user, array $filters): Paginator
    {
        $context = $this->accessService->resolve($user, $filters['company_id'] ?? null);
        $this->accessService->ensureManager($context);

        $query = $this->baseProjectQuery($context->company->id);

        if (! empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        if (! empty($filters['priority'])) {
            $query->where('priority', $filters['priority']);
        }

        if (! empty($filters['type'])) {
            $query->where('type', $filters['type']);
        }

        if (! empty($filters['search'])) {
            $query->where('name', 'like', '%' . $filters['search'] . '%');
        }

        return $query->latest('id')->simplePaginate(20)->withQueryString();
    }

    public function listForAgent(User $user, array $filters): Paginator
    {
        $context = $this->accessService->resolve($user, $filters['company_id'] ?? null);
        $this->accessService->ensureAgent($context);

        $query = $this->baseAgentProjectQuery($context->company->id, (int) $user->id);

        if (! empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        if (! empty($filters['priority'])) {
            $query->where('priority', $filters['priority']);
        }

        if (! empty($filters['type'])) {
            $query->where('type', $filters['type']);
        }

        if (! empty($filters['search'])) {
            $query->where('name', 'like', '%' . $filters['search'] . '%');
        }

        return $query->latest('id')->simplePaginate(20)->withQueryString();
    }

    public function create(User $user, array $data): Project
    {
        $context = $this->accessService->resolve($user, $data['company_id'] ?? null);
        $this->accessService->ensureManager($context);

        $managerId = $this->resolveManagerId($data, null);
        if ($managerId !== null) {
            $this->ensureManagerBelongsToCompany($context->company->id, $managerId);
        }

        $teamUserIds = $this->normalizeTeamUserIds($data['assigned_team'] ?? [], $managerId);
        $this->ensureUsersBelongToCompany($context->company->id, $teamUserIds, 'assigned_team');

        [$startDate, $endDate, $durationDays] = $this->resolveTimeline($data);

        return DB::transaction(function () use ($context, $user, $data, $managerId, $teamUserIds, $startDate, $endDate, $durationDays): Project {
            $project = Project::create([
                'company_id' => $context->company->id,
                'created_by_user_id' => $user->id,
                'project_manager_user_id' => $managerId,
                'name' => $data['name'],
                'description' => $data['description'] ?? null,
                'type' => $data['type'] ?? null,
                'status' => $data['status'],
                'priority' => $data['priority'] ?? null,
                'start_date' => $startDate,
                'end_date' => $endDate,
                'duration_days' => $durationDays,
                'territory_zone' => $data['territory_zone'] ?? null,
                'notes' => $data['notes'] ?? null,
            ]);

            $this->syncProjectTeam($project, $teamUserIds, $user->id);
            $this->storeAttachments($project, $user, $data['attachments'] ?? []);

            return $this->findForManager($user, $project, $context->company->id);
        });
    }

    public function update(User $user, Project $project, array $data): Project
    {
        $context = $this->accessService->resolve($user, $data['company_id'] ?? null);
        $this->accessService->ensureManager($context);
        $this->assertProjectInCompany($project, $context->company->id);

        $managerId = $this->resolveManagerId($data, $project->project_manager_user_id);
        if ($managerId !== null) {
            $this->ensureManagerBelongsToCompany($context->company->id, $managerId);
        }

        $teamUserIds = array_key_exists('assigned_team', $data)
            ? $this->normalizeTeamUserIds($data['assigned_team'] ?? [], $managerId)
            : null;

        if ($teamUserIds !== null) {
            $this->ensureUsersBelongToCompany($context->company->id, $teamUserIds, 'assigned_team');
        }

        [$startDate, $endDate, $durationDays] = $this->resolveTimeline([
            'start_date' => $data['start_date'] ?? $project->start_date?->toDateString(),
            'end_date' => array_key_exists('end_date', $data)
                ? $data['end_date']
                : $project->end_date?->toDateString(),
        ]);

        return DB::transaction(function () use ($user, $project, $data, $managerId, $teamUserIds, $startDate, $endDate, $durationDays, $context): Project {
            $project->update([
                'project_manager_user_id' => $managerId,
                'name' => $data['name'] ?? $project->name,
                'description' => $data['description'] ?? $project->description,
                'type' => array_key_exists('type', $data) ? $data['type'] : $project->type?->value,
                'status' => $data['status'] ?? $project->status?->value ?? ProjectStatus::PLANNING->value,
                'priority' => array_key_exists('priority', $data) ? $data['priority'] : $project->priority?->value,
                'start_date' => $startDate,
                'end_date' => $endDate,
                'duration_days' => $durationDays,
                'territory_zone' => array_key_exists('territory_zone', $data) ? $data['territory_zone'] : $project->territory_zone,
                'notes' => array_key_exists('notes', $data) ? $data['notes'] : $project->notes,
            ]);

            if ($teamUserIds !== null) {
                $this->syncProjectTeam($project, $teamUserIds, $user->id);
            }

            if (array_key_exists('attachments', $data)) {
                $this->storeAttachments($project, $user, $data['attachments'] ?? []);
            }

            return $this->findForManager($user, $project->fresh(), $context->company->id);
        });
    }

    public function findForManager(User $user, Project $project, ?int $companyId = null): Project
    {
        $context = $this->accessService->resolve($user, $companyId);
        $this->accessService->ensureManager($context);
        $this->assertProjectInCompany($project, $context->company->id);

        return $this->baseProjectQuery($context->company->id)
            ->whereKey($project->id)
            ->firstOrFail();
    }

    public function findForAgent(User $user, Project $project, ?int $companyId = null): Project
    {
        $context = $this->accessService->resolve($user, $companyId);
        $this->accessService->ensureAgent($context);
        $this->assertProjectInCompany($project, $context->company->id);

        return $this->baseAgentProjectQuery($context->company->id, (int) $user->id)
            ->whereKey($project->id)
            ->firstOrFail();
    }

    private function baseProjectQuery(int $companyId): Builder
    {
        return Project::query()
            ->where('company_id', $companyId)
            ->with([
                'creator:id,name,email,avatar,gender',
                'manager:id,name,email,avatar,gender',
                'teamUsers:id,name,email,avatar,gender',
                'files',
            ])
            ->withCount([
                'tasks as total_tasks_count',
                'tasks as completed_tasks_count' => fn(Builder $query) => $query->where('status', TaskStatus::COMPLETED->value),
                'tasks as pending_tasks_count' => fn(Builder $query) => $query->where('status', '!=', TaskStatus::COMPLETED->value),
            ]);
    }

    private function baseAgentProjectQuery(int $companyId, int $userId): Builder
    {
        return Project::query()
            ->where('company_id', $companyId)
            ->whereHas('tasks', function (Builder $taskQuery) use ($userId): void {
                $this->applyAgentTaskAssignmentConstraint($taskQuery, $userId);
            })
            ->with([
                'creator:id,name,email,avatar,gender',
                'manager:id,name,email,avatar,gender',
                'files',
            ])
            ->withCount([
                'tasks as total_tasks_count' => function (Builder $query) use ($userId): void {
                    $this->applyAgentTaskAssignmentConstraint($query, $userId);
                },
                'tasks as completed_tasks_count' => function (Builder $query) use ($userId): void {
                    $query->where('status', TaskStatus::COMPLETED->value);
                    $this->applyAgentTaskAssignmentConstraint($query, $userId);
                },
                'tasks as pending_tasks_count' => function (Builder $query) use ($userId): void {
                    $query->where('status', '!=', TaskStatus::COMPLETED->value);
                    $this->applyAgentTaskAssignmentConstraint($query, $userId);
                },
            ]);
    }

    private function applyAgentTaskAssignmentConstraint(Builder $taskQuery, int $userId): void
    {
        $taskQuery->where(function (Builder $assignedQuery) use ($userId): void {
            $assignedQuery->where('tasks.assigned_agent_id', $userId)
                ->orWhereExists(function ($sub) use ($userId): void {
                    $sub->selectRaw('1')
                        ->from('task_assignments')
                        ->whereColumn('task_assignments.task_id', 'tasks.id')
                        ->where('task_assignments.assigned_agent_id', $userId)
                        ->where('task_assignments.is_current', true);
                });
        });
    }

    private function resolveTimeline(array $data): array
    {
        $startDate = Carbon::parse((string) $data['start_date'])->startOfDay();
        $endDate = empty($data['end_date']) ? null : Carbon::parse((string) $data['end_date'])->startOfDay();

        if ($endDate !== null && $endDate->lt($startDate)) {
            throw ValidationException::withMessages([
                'end_date' => ['End date must be the same as or after the start date.'],
            ]);
        }

        $durationDays = $endDate ? $startDate->diffInDays($endDate) + 1 : null;

        return [$startDate->toDateString(), $endDate?->toDateString(), $durationDays];
    }

    private function ensureManagerBelongsToCompany(int $companyId, int $userId): void
    {
        // Caller is responsible for checking null before calling this method
        $membership = DB::table('company_users')
            ->where('company_id', $companyId)
            ->where('user_id', $userId)
            ->first();

        if (! $membership) {
            throw ValidationException::withMessages([
                'project_manager_user_id' => ['Selected project manager is not a member of this company.'],
            ]);
        }

        if (! in_array((string) $membership->role, ['owner', 'admin', 'supervisor'], true)) {
            throw ValidationException::withMessages([
                'project_manager_user_id' => ['Project manager must be an owner, admin, or supervisor.'],
            ]);
        }
    }

    private function ensureUsersBelongToCompany(int $companyId, array $userIds, string $field): void
    {
        if ($userIds === []) {
            return;
        }

        $count = DB::table('company_users')
            ->where('company_id', $companyId)
            ->whereIn('user_id', $userIds)
            ->count();

        if ($count !== count($userIds)) {
            throw ValidationException::withMessages([
                $field => ['One or more selected users do not belong to this company.'],
            ]);
        }
    }

    private function normalizeTeamUserIds(array $userIds, ?int $managerId): array
    {
        $normalized = array_values(array_unique(array_map('intval', $userIds)));

        if ($managerId === null) {
            return $normalized;
        }

        return array_values(array_filter($normalized, fn(int $userId): bool => $userId !== $managerId));
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function resolveManagerId(array $data, int|null $default): ?int
    {
        if (array_key_exists('project_manager_user_id', $data)) {
            $candidate = $data['project_manager_user_id'];
        } elseif (array_key_exists('project_manager', $data)) {
            $candidate = $data['project_manager'];
        } else {
            $candidate = $default;
        }

        return $candidate !== null ? (int) $candidate : null;
    }

    private function syncProjectTeam(Project $project, array $teamUserIds, int $assignedByUserId): void
    {
        $payload = [];

        foreach ($teamUserIds as $userId) {
            $payload[$userId] = [
                'assigned_by_user_id' => $assignedByUserId,
                'role' => 'team_member',
            ];
        }

        $project->teamUsers()->sync($payload);
    }

    /**
     * @param  array<int, UploadedFile>  $attachments
     */
    private function storeAttachments(Project $project, User $user, array $attachments): void
    {
        foreach ($attachments as $file) {
            $path = Storage::disk('public')->putFile("project-files/{$project->id}", $file);

            $project->files()->create([
                'uploaded_by_user_id' => $user->id,
                'disk' => 'public',
                'file_path' => $path,
                'original_name' => $file->getClientOriginalName(),
                'mime_type' => (string) $file->getMimeType(),
                'size_bytes' => (int) $file->getSize(),
                'metadata' => [
                    'extension' => $file->getClientOriginalExtension(),
                ],
            ]);
        }
    }

    private function assertProjectInCompany(Project $project, int $companyId): void
    {
        if ((int) $project->company_id !== $companyId) {
            throw ValidationException::withMessages([
                'project' => ['Project does not belong to the active company context.'],
            ]);
        }
    }
}
