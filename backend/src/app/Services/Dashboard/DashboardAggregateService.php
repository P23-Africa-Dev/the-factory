<?php

declare(strict_types=1);

namespace App\Services\Dashboard;

use App\Enums\LeadStatus;
use App\Models\AppNotification;
use App\Models\AttendanceRecord;
use App\Models\Lead;
use App\Models\LeadActivity;
use App\Models\LeadNote;
use App\Models\PayrollSetting;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskLocationPoint;
use App\Models\TaskProof;
use App\Models\TaskReassignment;
use App\Models\TaskTrackingSession;
use App\Models\User;
use App\Services\Analytics\AggregateCacheService;
use App\Services\Company\CompanyContextService;
use App\Services\Crm\LeadService;
use App\Support\AvatarUrlResolver;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

class DashboardAggregateService
{
    public function __construct(
        private readonly CompanyContextService $companyContextService,
        private readonly AggregateCacheService $cacheService,
        private readonly LeadService $leadService,
    ) {}

    public function overview(User $user, ?int $companyId = null, ?string $fromDate = null, ?string $toDate = null): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $role = (string) $context['role'];

        [$from, $to] = $this->resolveRange($fromDate, $toDate);

        $cacheVariant = implode('|', [
            $role,
            (string) $user->id,
            $from->toDateString(),
            $to->toDateString(),
        ]);

        return $this->cacheService->rememberForCompany(
            companyId: $resolvedCompanyId,
            scope: 'dashboard.overview',
            variant: $cacheVariant,
            ttlSeconds: 120,
            resolver: function () use ($resolvedCompanyId, $role, $user, $from, $to): array {
                $tasksInWindow = Task::query()
                    ->where('company_id', $resolvedCompanyId)
                    ->whereBetween('created_at', [$from->copy()->startOfDay(), $to->copy()->endOfDay()]);

                $allTasks = Task::query()->where('company_id', $resolvedCompanyId);
                $allProjects = Project::query()->where('company_id', $resolvedCompanyId);

                $allLeads = Lead::query()->where('company_id', $resolvedCompanyId);
                $leadsInWindow = Lead::query()
                    ->where('company_id', $resolvedCompanyId)
                    ->whereBetween('created_at', [$from->copy()->startOfDay(), $to->copy()->endOfDay()]);

                if ($role === 'agent') {
                    $this->applyAgentUploadedLeadScope($allLeads, (int) $user->id);
                    $this->applyAgentUploadedLeadScope($leadsInWindow, (int) $user->id);
                }

                $activeAgents = User::query()
                    ->where('internal_role', 'agent')
                    ->where('is_active', true)
                    ->whereExists(function ($query) use ($resolvedCompanyId): void {
                        $query->selectRaw('1')
                            ->from('company_users')
                            ->whereColumn('company_users.user_id', 'users.id')
                            ->where('company_users.company_id', $resolvedCompanyId);
                    })
                    ->count();

                $selfTaskBase = Task::query()
                    ->where('company_id', $resolvedCompanyId)
                    ->where('assigned_agent_id', $user->id);

                $upcomingTasks = Task::query()
                    ->where('company_id', $resolvedCompanyId)
                    ->whereNotNull('due_at')
                    ->whereBetween('due_at', [now(), now()->addDays(14)])
                    ->orderBy('due_at')
                    ->limit(12)
                    ->get(['id', 'title', 'due_at', 'status', 'assigned_agent_id', 'project_id']);

                $recentLocationUsers = TaskLocationPoint::query()
                    ->where('company_id', $resolvedCompanyId)
                    ->where('recorded_at', '>=', now()->subMinutes(30))
                    ->distinct('user_id')
                    ->count('user_id');

                $activityMetric = $this->buildActivityMetric(
                    companyId: $resolvedCompanyId,
                    role: $role,
                    userId: (int) $user->id,
                );

                $ongoingTasks = $this->buildOngoingTasks(
                    companyId: $resolvedCompanyId,
                    role: $role,
                    userId: (int) $user->id,
                );

                $totalProjects = (int) $allProjects->count();
                $completedProjects = (int) (clone $allProjects)->where('status', 'completed')->count();
                $completionRate = $totalProjects > 0
                    ? round(($completedProjects / $totalProjects) * 100, 2)
                    : 0;

                return [
                    'kpis' => [
                        'total_tasks' => (int) $allTasks->count(),
                        'completed_tasks' => (int) (clone $allTasks)->where('status', 'completed')->count(),
                        'active_agents' => (int) $activeAgents,
                        'total_leads' => (int) $allLeads->count(),
                        'converted_leads' => (int) (clone $allLeads)->whereNotNull('converted_at')->count(),
                        'payroll_configured' => PayrollSetting::query()->where('company_id', $resolvedCompanyId)->exists(),
                    ],
                    'project_kpis' => [
                        'total_projects' => $totalProjects,
                        'active_projects' => (int) (clone $allProjects)->where('status', 'active')->count(),
                        'planning_projects' => (int) (clone $allProjects)->where('status', 'planning')->count(),
                        'completed_projects' => $completedProjects,
                        'completion_rate' => $completionRate,
                    ],
                    'activity_summary' => [
                        'range' => [
                            'from_date' => $from->toDateString(),
                            'to_date' => $to->toDateString(),
                        ],
                        'tasks_created' => (int) (clone $tasksInWindow)->count(),
                        'tasks_completed' => (int) (clone $tasksInWindow)->where('status', 'completed')->count(),
                        'leads_created' => (int) (clone $leadsInWindow)->count(),
                        'leads_won' => (int) (clone $leadsInWindow)->where('status', LeadStatus::WON->value)->count(),
                    ],
                    'self_task_slices' => [
                        'pending' => (int) (clone $selfTaskBase)->where('status', 'pending')->count(),
                        'in_progress' => (int) (clone $selfTaskBase)->where('status', 'in_progress')->count(),
                        'completed' => (int) (clone $selfTaskBase)->where('status', 'completed')->count(),
                        'cancelled' => (int) (clone $selfTaskBase)->where('status', 'cancelled')->count(),
                    ],
                    'top_prospects' => Lead::query()
                        ->where('company_id', $resolvedCompanyId)
                        ->when($role === 'agent', function (Builder $query) use ($user): void {
                            $this->applyAgentLeadScope($query, (int) $user->id);
                        })
                        ->orderByDesc('updated_at')
                        ->limit(5)
                        ->get(['id', 'name', 'status', 'priority', 'assigned_to_user_id'])
                        ->map(function (Lead $lead): array {
                            $priority = $lead->priority;

                            return [
                                'id' => $lead->id,
                                'name' => $lead->name,
                                'status' => (string) $lead->status,
                                'priority' => $priority instanceof \BackedEnum ? $priority->value : ($priority !== null ? (string) $priority : null),
                                'assigned_to_user_id' => $lead->assigned_to_user_id,
                            ];
                        })
                        ->values()
                        ->all(),
                    'crm_pipeline_snapshot' => $this->leadService->pipelineSummary($user, $resolvedCompanyId),
                    'calendar_task_feed' => $upcomingTasks->map(static fn(Task $task): array => [
                        'id' => $task->id,
                        'title' => $task->title,
                        'due_at' => $task->due_at?->toIso8601String(),
                        'status' => $task->status?->value,
                        'assigned_agent_id' => $task->assigned_agent_id,
                        'project_id' => $task->project_id,
                    ])->values()->all(),
                    'agent_live_activity' => [
                        'agents_with_recent_location_ping' => (int) $recentLocationUsers,
                    ],
                    'activity_metric' => $activityMetric,
                    'ongoing_tasks' => $ongoingTasks,
                    'leads_trend' => $this->buildLeadsTrend($resolvedCompanyId, $role, (int) $user->id),
                ];
            },
        );
    }

    private function buildActivityMetric(int $companyId, string $role, int $userId): array
    {
        $currentWeekStart = now()->startOfWeek(CarbonInterface::MONDAY)->startOfDay();
        $currentWeekEnd = $currentWeekStart->copy()->addDays(6)->endOfDay();
        $previousWeekStart = $currentWeekStart->copy()->subWeek()->startOfDay();
        $previousWeekEnd = $previousWeekStart->copy()->addDays(6)->endOfDay();

        $dailyTotals = [];
        $cursor = $previousWeekStart->copy();
        while ($cursor->lte($currentWeekEnd)) {
            $dailyTotals[$cursor->toDateString()] = 0;
            $cursor->addDay();
        }

        $this->accumulateDailyActivity(
            dailyTotals: $dailyTotals,
            query: Task::query()->where('company_id', $companyId),
            dateColumn: 'created_at',
            role: $role,
            userId: $userId,
            scopeColumn: 'created_by_user_id',
            from: $previousWeekStart,
            to: $currentWeekEnd,
        );

        $this->accumulateDailyActivity(
            dailyTotals: $dailyTotals,
            query: Task::query()->where('company_id', $companyId)->whereNotNull('started_at'),
            dateColumn: 'started_at',
            role: $role,
            userId: $userId,
            scopeColumn: 'assigned_agent_id',
            from: $previousWeekStart,
            to: $currentWeekEnd,
        );

        $this->accumulateDailyActivity(
            dailyTotals: $dailyTotals,
            query: Task::query()->where('company_id', $companyId)->whereNotNull('completed_at'),
            dateColumn: 'completed_at',
            role: $role,
            userId: $userId,
            scopeColumn: 'assigned_agent_id',
            from: $previousWeekStart,
            to: $currentWeekEnd,
        );

        $this->accumulateDailyActivity(
            dailyTotals: $dailyTotals,
            query: TaskReassignment::query()->where('company_id', $companyId),
            dateColumn: 'requested_at',
            role: $role,
            userId: $userId,
            scopeColumn: null,
            from: $previousWeekStart,
            to: $currentWeekEnd,
            customScope: function (Builder $query, int $actorId): void {
                $query->where(function (Builder $nested) use ($actorId): void {
                    $nested->where('requested_by_user_id', $actorId)
                        ->orWhere('from_user_id', $actorId)
                        ->orWhere('to_user_id', $actorId)
                        ->orWhere('responded_by_user_id', $actorId);
                });
            },
        );

        $this->accumulateDailyActivity(
            dailyTotals: $dailyTotals,
            query: TaskReassignment::query()->where('company_id', $companyId)->whereNotNull('responded_at'),
            dateColumn: 'responded_at',
            role: $role,
            userId: $userId,
            scopeColumn: null,
            from: $previousWeekStart,
            to: $currentWeekEnd,
            customScope: function (Builder $query, int $actorId): void {
                $query->where(function (Builder $nested) use ($actorId): void {
                    $nested->where('requested_by_user_id', $actorId)
                        ->orWhere('from_user_id', $actorId)
                        ->orWhere('to_user_id', $actorId)
                        ->orWhere('responded_by_user_id', $actorId);
                });
            },
        );

        $this->accumulateDailyActivity(
            dailyTotals: $dailyTotals,
            query: AttendanceRecord::query()->where('company_id', $companyId)->whereNotNull('clock_in_at'),
            dateColumn: 'clock_in_at',
            role: $role,
            userId: $userId,
            scopeColumn: 'user_id',
            from: $previousWeekStart,
            to: $currentWeekEnd,
        );

        $this->accumulateDailyActivity(
            dailyTotals: $dailyTotals,
            query: AttendanceRecord::query()->where('company_id', $companyId)->whereNotNull('clock_out_at'),
            dateColumn: 'clock_out_at',
            role: $role,
            userId: $userId,
            scopeColumn: 'user_id',
            from: $previousWeekStart,
            to: $currentWeekEnd,
        );

        $this->accumulateDailyActivity(
            dailyTotals: $dailyTotals,
            query: Lead::query()->where('company_id', $companyId),
            dateColumn: 'created_at',
            role: $role,
            userId: $userId,
            scopeColumn: 'created_by_user_id',
            from: $previousWeekStart,
            to: $currentWeekEnd,
        );

        $this->accumulateDailyActivity(
            dailyTotals: $dailyTotals,
            query: LeadActivity::query()->where('company_id', $companyId),
            dateColumn: 'created_at',
            role: $role,
            userId: $userId,
            scopeColumn: 'created_by_user_id',
            from: $previousWeekStart,
            to: $currentWeekEnd,
        );

        $this->accumulateDailyActivity(
            dailyTotals: $dailyTotals,
            query: LeadNote::query()->where('company_id', $companyId),
            dateColumn: 'created_at',
            role: $role,
            userId: $userId,
            scopeColumn: 'created_by_user_id',
            from: $previousWeekStart,
            to: $currentWeekEnd,
        );

        if ($role !== 'agent') {
            $this->accumulateDailyActivity(
                dailyTotals: $dailyTotals,
                query: PayrollSetting::query()->where('company_id', $companyId),
                dateColumn: 'created_at',
                role: $role,
                userId: $userId,
                scopeColumn: null,
                from: $previousWeekStart,
                to: $currentWeekEnd,
            );

            $this->accumulateDailyActivity(
                dailyTotals: $dailyTotals,
                query: PayrollSetting::query()
                    ->where('company_id', $companyId)
                    ->whereColumn('updated_at', '!=', 'created_at'),
                dateColumn: 'updated_at',
                role: $role,
                userId: $userId,
                scopeColumn: null,
                from: $previousWeekStart,
                to: $currentWeekEnd,
            );
        }

        $this->accumulateDailyActivity(
            dailyTotals: $dailyTotals,
            query: TaskTrackingSession::query()->where('company_id', $companyId),
            dateColumn: 'start_recorded_at',
            role: $role,
            userId: $userId,
            scopeColumn: 'started_by_user_id',
            from: $previousWeekStart,
            to: $currentWeekEnd,
        );

        $this->accumulateDailyActivity(
            dailyTotals: $dailyTotals,
            query: TaskLocationPoint::query()->where('company_id', $companyId),
            dateColumn: 'recorded_at',
            role: $role,
            userId: $userId,
            scopeColumn: 'user_id',
            from: $previousWeekStart,
            to: $currentWeekEnd,
        );

        $this->accumulateDailyActivity(
            dailyTotals: $dailyTotals,
            query: TaskProof::query()
                ->whereHas('task', static function (Builder $query) use ($companyId): void {
                    $query->where('company_id', $companyId);
                }),
            dateColumn: 'created_at',
            role: $role,
            userId: $userId,
            scopeColumn: 'uploaded_by_user_id',
            from: $previousWeekStart,
            to: $currentWeekEnd,
        );

        $this->accumulateDailyActivity(
            dailyTotals: $dailyTotals,
            query: AppNotification::query()
                ->where('company_id', $companyId)
                ->whereNotNull('read_at'),
            dateColumn: 'read_at',
            role: $role,
            userId: $userId,
            scopeColumn: 'user_id',
            from: $previousWeekStart,
            to: $currentWeekEnd,
        );

        $this->accumulateDailyActivity(
            dailyTotals: $dailyTotals,
            query: Project::query()->where('company_id', $companyId),
            dateColumn: 'created_at',
            role: $role,
            userId: $userId,
            scopeColumn: 'created_by_user_id',
            from: $previousWeekStart,
            to: $currentWeekEnd,
        );

        if ($role !== 'agent') {
            $this->accumulateDailyActivity(
                dailyTotals: $dailyTotals,
                query: DB::table('company_users')->where('company_id', $companyId),
                dateColumn: 'created_at',
                role: $role,
                userId: $userId,
                scopeColumn: null,
                from: $previousWeekStart,
                to: $currentWeekEnd,
            );
        }

        $currentWeek = 0;
        $previousWeek = 0;
        $currentWeekDaily = [];

        $cursor = $currentWeekStart->copy();
        while ($cursor->lte($currentWeekEnd)) {
            $dayKey = $cursor->toDateString();
            $dayTotal = (int) ($dailyTotals[$dayKey] ?? 0);
            $currentWeek += $dayTotal;
            $currentWeekDaily[] = [
                'name' => $cursor->format('D'),
                'value' => $dayTotal,
            ];

            $previousKey = $cursor->copy()->subWeek()->toDateString();
            $previousWeek += (int) ($dailyTotals[$previousKey] ?? 0);
            $cursor->addDay();
        }

        $score = 0.0;
        $direction = 'flat';

        if ($previousWeek === 0 && $currentWeek > 0) {
            $score = 100.0;
            $direction = 'up';
        } elseif ($previousWeek > 0) {
            $score = round((($currentWeek - $previousWeek) / $previousWeek) * 100, 2);

            if ($score > 0) {
                $direction = 'up';
            } elseif ($score < 0) {
                $direction = 'down';
            }
        }

        return [
            'activity_score' => $score,
            'direction' => $direction,
            'current_week' => $currentWeek,
            'previous_week' => $previousWeek,
            'current_week_daily' => $currentWeekDaily,
        ];
    }

    /**
     * @param  array<string, int>  $dailyTotals
     */
    private function accumulateDailyActivity(
        array &$dailyTotals,
        Builder|\Illuminate\Database\Query\Builder $query,
        string $dateColumn,
        string $role,
        int $userId,
        ?string $scopeColumn,
        Carbon $from,
        Carbon $to,
        ?\Closure $customScope = null,
    ): void {
        $base = clone $query;
        $base->whereNotNull($dateColumn);
        $base->whereBetween($dateColumn, [$from, $to]);

        if ($role === 'agent') {
            if ($customScope instanceof \Closure) {
                $customScope($base, $userId);
            } elseif ($scopeColumn !== null) {
                $base->where($scopeColumn, $userId);
            }
        }

        $rows = $base
            ->selectRaw("DATE($dateColumn) as day, COUNT(*) as total")
            ->groupBy('day')
            ->pluck('total', 'day');

        foreach ($rows as $day => $total) {
            $dayKey = (string) $day;
            if (! array_key_exists($dayKey, $dailyTotals)) {
                $dailyTotals[$dayKey] = 0;
            }

            $dailyTotals[$dayKey] += (int) $total;
        }
    }

    private function buildOngoingTasks(int $companyId, string $role, int $userId): array
    {
        $tasksQuery = Task::query()
            ->where('company_id', $companyId)
            ->where('status', 'in_progress')
            ->with([
                'assignedAgent:id,name,avatar,gender',
                'trackingSession:id,task_id,start_latitude,start_longitude,last_latitude,last_longitude,destination_latitude,destination_longitude,destination_radius_meters,near_detected_at,arrival_detected_at,end_recorded_at,last_recorded_at',
            ]);

        if ($role === 'agent') {
            $tasksQuery->where('assigned_agent_id', $userId);
        }

        $tasks = $tasksQuery
            ->orderByDesc('updated_at')
            ->limit(12)
            ->get();

        $items = [];
        foreach ($tasks as $task) {
            $session = $task->trackingSession;
            if (! $session || $session->end_recorded_at !== null) {
                continue;
            }

            $startLat = $session->start_latitude;
            $startLng = $session->start_longitude;
            $destinationLat = $session->destination_latitude ?? $task->latitude;
            $destinationLng = $session->destination_longitude ?? $task->longitude;
            $currentLat = $session->last_latitude ?? $startLat;
            $currentLng = $session->last_longitude ?? $startLng;

            $totalDistanceMeters = null;
            $coveredDistanceMeters = null;
            $remainingDistanceMeters = null;
            $progress = 0.0;

            if (
                $startLat !== null && $startLng !== null
                && $destinationLat !== null && $destinationLng !== null
                && $currentLat !== null && $currentLng !== null
            ) {
                $totalDistanceMeters = $this->distanceMeters(
                    (float) $startLat,
                    (float) $startLng,
                    (float) $destinationLat,
                    (float) $destinationLng,
                );

                $coveredDistanceMeters = $this->distanceMeters(
                    (float) $startLat,
                    (float) $startLng,
                    (float) $currentLat,
                    (float) $currentLng,
                );

                if ($totalDistanceMeters > 0) {
                    $coveredDistanceMeters = min($totalDistanceMeters, $coveredDistanceMeters);
                    $remainingDistanceMeters = max(0.0, $totalDistanceMeters - $coveredDistanceMeters);
                    $progress = round(($coveredDistanceMeters / $totalDistanceMeters) * 100, 2);
                }
            }

            $trackingState = 'in_progress';
            $statusLabel = 'ACTIVE';
            if ($session->arrival_detected_at !== null) {
                $trackingState = 'arrived';
                $statusLabel = 'ARRIVED';
                $progress = 100.0;
                $remainingDistanceMeters = 0.0;
            } elseif ($session->near_detected_at !== null) {
                $trackingState = 'near_destination';
                $statusLabel = 'NEAR DESTINATION';
            }

            $assignedAgent = $task->assignedAgent;
            $agentName = trim((string) ($assignedAgent?->name ?: 'Unknown Agent'));
            $nameParts = preg_split('/\s+/', $agentName) ?: [];
            $initials = '';
            foreach (array_slice($nameParts, 0, 2) as $part) {
                if ($part !== '') {
                    $initials .= strtoupper(substr($part, 0, 1));
                }
            }

            if ($initials === '') {
                $initials = 'A';
            }

            $items[] = [
                'task_id' => (int) $task->id,
                'task_title' => (string) $task->title,
                'status' => $statusLabel,
                'tracking_state' => $trackingState,
                'progress_percent' => max(0.0, min(100.0, $progress)),
                'total_distance_meters' => $totalDistanceMeters !== null ? round($totalDistanceMeters, 2) : null,
                'covered_distance_meters' => $coveredDistanceMeters !== null ? round($coveredDistanceMeters, 2) : null,
                'remaining_distance_meters' => $remainingDistanceMeters !== null ? round($remainingDistanceMeters, 2) : null,
                'eta_minutes' => null,
                'agent' => [
                    'id' => $assignedAgent?->id,
                    'name' => $agentName,
                    'avatar_url' => AvatarUrlResolver::resolve($assignedAgent?->avatar, $assignedAgent?->gender),
                    'initials' => $initials,
                ],
            ];
        }

        usort($items, static function (array $a, array $b): int {
            return (int) $b['progress_percent'] <=> (int) $a['progress_percent'];
        });

        return array_values($items);
    }

    private function distanceMeters(float $fromLat, float $fromLng, float $toLat, float $toLng): float
    {
        $earthRadius = 6371000.0;

        $deltaLat = deg2rad($toLat - $fromLat);
        $deltaLng = deg2rad($toLng - $fromLng);

        $a = sin($deltaLat / 2) ** 2
            + cos(deg2rad($fromLat))
            * cos(deg2rad($toLat))
            * sin($deltaLng / 2) ** 2;

        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));

        return $earthRadius * $c;
    }

    private function applyAgentLeadScope(Builder $query, int $userId): void
    {
        $query->where(function (Builder $builder) use ($userId): void {
            $builder->where('created_by_user_id', $userId)
                ->orWhere('assigned_to_user_id', $userId);
        });
    }

    private function applyAgentUploadedLeadScope(Builder $query, int $userId): void
    {
        $query->where('created_by_user_id', $userId);
        $this->applyAgentUploadedSourceFilter($query);
    }

    private function applyAgentUploadedSourceFilter(Builder $query): void
    {
        $accepted = [
            'agent upload',
            'agent uploaded',
            'uploaded by agent',
            'uploaded by agents',
        ];

        $quoted = implode(',', array_map(static fn (string $value): string => "'" . str_replace("'", "''", $value) . "'", $accepted));

        $query->whereRaw(
            "LOWER(TRIM(REPLACE(REPLACE(COALESCE(source, ''), '-', ' '), '_', ' '))) IN ($quoted)"
        );
    }

    /**
     * @return array<int, array{name: string, v1: int, v2: int}>
     */
    private function buildLeadsTrend(int $companyId, string $role, int $userId): array
    {
        $query = Lead::query()->where('company_id', $companyId);

        if ($role === 'agent') {
            $this->applyAgentUploadedLeadScope($query, $userId);
        }

        $points = [];

        for ($offset = 5; $offset >= 0; $offset--) {
            $dayStart = now()->subDays($offset)->startOfDay();
            $dayEnd = $dayStart->copy()->endOfDay();
            $created = (int) (clone $query)
                ->whereBetween('created_at', [$dayStart, $dayEnd])
                ->count();
            $converted = (int) (clone $query)
                ->whereBetween('created_at', [$dayStart, $dayEnd])
                ->whereNotNull('converted_at')
                ->count();

            $points[] = [
                'name' => (string) (6 - $offset),
                'v1' => $created,
                'v2' => $converted,
            ];
        }

        return $points;
    }

    private function resolveRange(?string $fromDate, ?string $toDate): array
    {
        $to = $toDate ? Carbon::parse($toDate)->endOfDay() : now()->endOfDay();
        $from = $fromDate ? Carbon::parse($fromDate)->startOfDay() : $to->copy()->subDays(6)->startOfDay();

        if ($from->gt($to)) {
            [$from, $to] = [$to->copy()->startOfDay(), $from->copy()->endOfDay()];
        }

        return [$from, $to];
    }
}
