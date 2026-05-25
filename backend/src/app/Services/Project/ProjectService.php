<?php

declare(strict_types=1);

namespace App\Services\Project;

use App\Enums\NotificationCategory;
use App\Enums\NotificationPriority;
use App\Enums\ProjectStatus;
use App\Enums\TaskStatus;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Services\Notification\NotificationService;
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
    public function __construct(
        private readonly TaskAccessService $accessService,
        private readonly NotificationService $notificationService,
    ) {}

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

    /**
     * @return array{projects: Paginator, analytics: array<string, mixed>}
     */
    public function listForManagerWithAnalytics(User $user, array $filters): array
    {
        $context = $this->accessService->resolve($user, $filters['company_id'] ?? null);
        $this->accessService->ensureManager($context);

        return [
            'projects' => $this->listForManager($user, $filters),
            'analytics' => $this->buildProjectAnalytics(
                companyId: (int) $context->company->id,
                role: $context->role,
                userId: (int) $user->id,
                filters: $filters,
            ),
        ];
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

    /**
     * @return array{projects: Paginator, analytics: array<string, mixed>}
     */
    public function listForAgentWithAnalytics(User $user, array $filters): array
    {
        $context = $this->accessService->resolve($user, $filters['company_id'] ?? null);
        $this->accessService->ensureAgent($context);

        return [
            'projects' => $this->listForAgent($user, $filters),
            'analytics' => $this->buildProjectAnalytics(
                companyId: (int) $context->company->id,
                role: $context->role,
                userId: (int) $user->id,
                filters: $filters,
            ),
        ];
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

        $project = DB::transaction(function () use ($context, $user, $data, $managerId, $teamUserIds, $startDate, $endDate, $durationDays): Project {
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

        $this->notifyProjectUpdated(
            project: $project,
            actor: $user,
            type: 'project.created',
            title: 'New project created',
            message: "Project '{$project->name}' has been created.",
            priority: NotificationPriority::HIGH->value,
        );

        return $project;
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

        $updatedProject = DB::transaction(function () use ($user, $project, $data, $managerId, $teamUserIds, $startDate, $endDate, $durationDays, $context): Project {
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

        $this->notifyProjectUpdated(
            project: $updatedProject,
            actor: $user,
            type: 'project.updated',
            title: 'Project updated',
            message: "Project '{$updatedProject->name}' has been updated.",
            priority: NotificationPriority::NORMAL->value,
        );

        return $updatedProject;
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
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    private function buildProjectAnalytics(int $companyId, string $role, int $userId, array $filters): array
    {
        $projectIdsQuery = Project::query()
            ->where('projects.company_id', $companyId)
            ->select('projects.id');

        if ($role === 'agent') {
            $projectIdsQuery->whereHas('tasks', function (Builder $taskQuery) use ($userId): void {
                $this->applyAgentTaskAssignmentConstraint($taskQuery, $userId);
            });
        }

        if (! empty($filters['status'])) {
            $projectIdsQuery->where('projects.status', $filters['status']);
        }

        if (! empty($filters['priority'])) {
            $projectIdsQuery->where('projects.priority', $filters['priority']);
        }

        if (! empty($filters['type'])) {
            $projectIdsQuery->where('projects.type', $filters['type']);
        }

        if (! empty($filters['search'])) {
            $projectIdsQuery->where('projects.name', 'like', '%' . $filters['search'] . '%');
        }

        $projectIds = (clone $projectIdsQuery)->pluck('projects.id');
        $projectCount = $projectIds->count();

        $timelineConsumption = 0.0;
        if ($projectCount > 0) {
            $timelineRows = Project::query()
                ->whereIn('id', $projectIds)
                ->get(['start_date', 'end_date']);

            $totalDurationDays = 0.0;
            $elapsedDays = 0.0;
            $today = now()->startOfDay();

            foreach ($timelineRows as $row) {
                if (! $row->start_date || ! $row->end_date) {
                    continue;
                }

                $start = $row->start_date->copy()->startOfDay();
                $end = $row->end_date->copy()->startOfDay();

                if ($end->lt($start)) {
                    continue;
                }

                // Use diffInDays to align with product expectation (Aug 1 to Aug 31 = 30 days).
                $duration = max(1, $start->diffInDays($end));
                $elapsed = 0;

                if ($today->greaterThan($start)) {
                    $elapsed = min($duration, $start->diffInDays($today));
                }

                $totalDurationDays += $duration;
                $elapsedDays += $elapsed;
            }

            if ($totalDurationDays > 0) {
                $timelineConsumption = round(($elapsedDays / $totalDurationDays) * 100, 2);
            }
        }

        $tasksQuery = Task::query()
            ->where('company_id', $companyId)
            ->whereIn('project_id', $projectIds)
            ->whereNotNull('assigned_agent_id');

        if ($role === 'agent') {
            $this->applyAgentTaskAssignmentConstraint($tasksQuery, $userId);
        }

        $totalTasks = (int) (clone $tasksQuery)->count();
        $completedTasks = (int) (clone $tasksQuery)->where('status', TaskStatus::COMPLETED->value)->count();
        $taskCompletion = $totalTasks > 0
            ? round(($completedTasks / $totalTasks) * 100, 2)
            : 0.0;

        $paceGap = max(0.0, $timelineConsumption - $taskCompletion);
        $paceScore = max(0.0, min(100.0, 100.0 - ($paceGap * 2)));
        $projectProgress = round(($taskCompletion * 0.7) + ($paceScore * 0.3), 2);

        $status = match (true) {
            $projectProgress <= 25 => 'POOR',
            $projectProgress <= 50 => 'FAIR',
            $projectProgress <= 75 => 'GOOD',
            default => 'EXCELLENT',
        };

        $assignedAgents = (int) (clone $tasksQuery)
            ->distinct('assigned_agent_id')
            ->count('assigned_agent_id');

        $notStartedBase = (clone $tasksQuery)
            ->where('status', TaskStatus::PENDING->value)
            ->whereNull('started_at');

        $notStartedAgents = (int) (clone $notStartedBase)
            ->distinct('assigned_agent_id')
            ->count('assigned_agent_id');

        $notStartedPercentage = $assignedAgents > 0
            ? round(($notStartedAgents / $assignedAgents) * 100, 2)
            : 0.0;

        $startOfCurrentWeek = now()->startOfWeek();
        $startOfPreviousWeek = $startOfCurrentWeek->copy()->subWeek();
        $endOfPreviousWeek = $startOfCurrentWeek->copy()->subSecond();

        $currentWeekNotStarted = (int) (clone $notStartedBase)
            ->whereBetween('created_at', [$startOfCurrentWeek, now()])
            ->distinct('assigned_agent_id')
            ->count('assigned_agent_id');

        $previousWeekNotStarted = (int) (clone $notStartedBase)
            ->whereBetween('created_at', [$startOfPreviousWeek, $endOfPreviousWeek])
            ->distinct('assigned_agent_id')
            ->count('assigned_agent_id');

        $trendDirection = 'flat';
        if ($currentWeekNotStarted < $previousWeekNotStarted) {
            $trendDirection = 'improved';
        } elseif ($currentWeekNotStarted > $previousWeekNotStarted) {
            $trendDirection = 'worsened';
        }

        return [
            'project_performance' => [
                'project_progress' => $projectProgress,
                'task_completion' => $taskCompletion,
                'timeline_consumption' => $timelineConsumption,
                'status' => $status,
            ],
            'non_commenced_agents' => [
                'assigned_agents' => $assignedAgents,
                'not_started' => $notStartedAgents,
                'percentage' => $notStartedPercentage,
                'previous_week_not_started' => $previousWeekNotStarted,
                'current_week_not_started' => $currentWeekNotStarted,
                'trend_direction' => $trendDirection,
            ],
        ];
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

    private function notifyProjectUpdated(
        Project $project,
        User $actor,
        string $type,
        string $title,
        string $message,
        string $priority,
    ): void {
        $project->loadMissing('teamUsers:id', 'manager:id');

        $recipientIds = collect([
            (int) $project->created_by_user_id,
            (int) ($project->project_manager_user_id ?? 0),
        ])
            ->merge($project->teamUsers->pluck('id')->map(static fn(mixed $id): int => (int) $id))
            ->filter(static fn(int $id): bool => $id > 0)
            ->unique()
            ->reject(static fn(int $id): bool => $id === (int) $actor->id)
            ->values()
            ->all();

        foreach ($recipientIds as $recipientId) {
            $this->notificationService->notifyUser($recipientId, [
                'company_id' => (int) $project->company_id,
                'type' => $type,
                'category' => NotificationCategory::PROJECT->value,
                'title' => $title,
                'message' => $message,
                'reference_type' => Project::class,
                'reference_id' => (int) $project->id,
                'action_url' => '/projects/' . $project->id,
                'action_route' => 'projects.show',
                'priority' => $priority,
                'created_by_user_id' => (int) $actor->id,
                'metadata' => [
                    'project_id' => (int) $project->id,
                    'project_status' => $project->status?->value,
                    'actor_user_id' => (int) $actor->id,
                ],
                'dedupe_key' => $type . ':' . $project->id . ':' . $recipientId,
            ]);
        }
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
