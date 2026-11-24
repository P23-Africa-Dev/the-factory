<?php

declare(strict_types=1);

namespace App\Services\Dashboard;

use App\Models\AppNotification;
use App\Models\AttendanceRecord;
use App\Models\Lead;
use App\Models\LeadActivity;
use App\Models\LeadLabel;
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
                    $this->applyAgentLeadScope($allLeads, (int) $user->id);
                    $this->applyAgentLeadScope($leadsInWindow, (int) $user->id);
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

                $ongoing = $this->buildOngoing(
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
                        // Leads (any creation date) that reached a won stage inside the window.
                        'leads_won' => (int) (clone $allLeads)
                            ->whereBetween('converted_at', [$from->copy()->startOfDay(), $to->copy()->endOfDay()])
                            ->count(),
                    ],
                    'self_task_slices' => [
                        'pending' => (int) (clone $selfTaskBase)->where('status', 'pending')->count(),
                        'in_progress' => (int) (clone $selfTaskBase)->where('status', 'in_progress')->count(),
                        'completed' => (int) (clone $selfTaskBase)->where('status', 'completed')->count(),
                        'cancelled' => (int) (clone $selfTaskBase)->where('status', 'cancelled')->count(),
                    ],
                    'top_prospects' => $this->buildTopProspects(
                        companyId: $resolvedCompanyId,
                        role: $role,
                        userId: (int) $user->id,
                        from: $from->copy()->startOfDay(),
                        to: $to->copy()->endOfDay(),
                    ),
                    'crm_pipeline_snapshot' => $this->leadService->pipelineSummary($user, $resolvedCompanyId),
                    'stage_progress' => $this->buildStageProgress($resolvedCompanyId),
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
                    'ongoing_tasks' => $ongoing['tasks'],
                    'ongoing_agents' => $ongoing['agents'],
                    'leads_trend' => $this->buildLeadsTrend($resolvedCompanyId, $role, (int) $user->id),
                ];
            },
        );
    }

    /**
     * Activity score: actions this week so far vs. the same elapsed span of last week
     * (Monday 00:00 up to the same weekday and time). Passive events (GPS pings,
     * notification reads) are not counted. Agents: own actions. Managers: whole team.
     */
    private function buildActivityMetric(int $companyId, string $role, int $userId): array
    {
        $now = now();
        $currentWeekStart = $now->copy()->startOfWeek(CarbonInterface::MONDAY)->startOfDay();
        $currentWeekEnd = $currentWeekStart->copy()->addDays(6)->endOfDay();
        $previousWeekStart = $currentWeekStart->copy()->subWeek();
        $previousWeekEnd = $previousWeekStart->copy()->addDays(6)->endOfDay();
        $previousSameMoment = $now->copy()->subWeek();

        // Per-day totals for both full weeks (for the chart).
        $dailyTotals = $this->emptyDays($previousWeekStart, $currentWeekEnd);
        $this->accumulateActivitySources($dailyTotals, $companyId, $role, $userId, $previousWeekStart, $currentWeekEnd);

        // Like-for-like totals for the score.
        $currentSpan = $this->emptyDays($currentWeekStart, $now);
        $this->accumulateActivitySources($currentSpan, $companyId, $role, $userId, $currentWeekStart, $now);
        $previousSpan = $this->emptyDays($previousWeekStart, $previousSameMoment);
        $this->accumulateActivitySources($previousSpan, $companyId, $role, $userId, $previousWeekStart, $previousSameMoment);

        $currentWeek = (int) array_sum($currentSpan);
        $previousWeek = (int) array_sum($previousSpan);

        $currentWeekDaily = [];
        $previousWeekDaily = [];
        $cursor = $currentWeekStart->copy();
        while ($cursor->lte($currentWeekEnd)) {
            $currentWeekDaily[] = [
                'name' => $cursor->format('D'),
                'value' => (int) ($dailyTotals[$cursor->toDateString()] ?? 0),
            ];
            $previousWeekDaily[] = [
                'name' => $cursor->format('D'),
                'value' => (int) ($dailyTotals[$cursor->copy()->subWeek()->toDateString()] ?? 0),
            ];
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
            'scope' => $role === 'agent' ? 'self' : 'team',
            // Like-for-like totals behind the score.
            'current_week' => $currentWeek,
            'previous_week' => $previousWeek,
            'current_week_daily' => $currentWeekDaily,
            'previous_week_daily' => $previousWeekDaily,
        ];
    }

    /**
     * @return array<string, int>
     */
    private function emptyDays(Carbon $from, Carbon $to): array
    {
        $days = [];
        $cursor = $from->copy()->startOfDay();
        while ($cursor->lte($to)) {
            $days[$cursor->toDateString()] = 0;
            $cursor->addDay();
        }

        return $days;
    }

    /**
     * Every counted action type. One row = one action, dated by its column.
     *
     * @param  array<string, int>  $dailyTotals
     */
    private function accumulateActivitySources(array &$dailyTotals, int $companyId, string $role, int $userId, Carbon $from, Carbon $to): void
    {
        $reassignmentScope = function (Builder $query, int $actorId): void {
            $query->where(function (Builder $nested) use ($actorId): void {
                $nested->where('requested_by_user_id', $actorId)
                    ->orWhere('from_user_id', $actorId)
                    ->orWhere('to_user_id', $actorId)
                    ->orWhere('responded_by_user_id', $actorId);
            });
        };

        $sources = [
            [Task::query()->where('company_id', $companyId), 'created_at', 'created_by_user_id', null],
            [Task::query()->where('company_id', $companyId)->whereNotNull('started_at'), 'started_at', 'assigned_agent_id', null],
            [Task::query()->where('company_id', $companyId)->whereNotNull('completed_at'), 'completed_at', 'assigned_agent_id', null],
            [TaskReassignment::query()->where('company_id', $companyId), 'requested_at', null, $reassignmentScope],
            [TaskReassignment::query()->where('company_id', $companyId)->whereNotNull('responded_at'), 'responded_at', null, $reassignmentScope],
            [AttendanceRecord::query()->where('company_id', $companyId)->whereNotNull('clock_in_at'), 'clock_in_at', 'user_id', null],
            [AttendanceRecord::query()->where('company_id', $companyId)->whereNotNull('clock_out_at'), 'clock_out_at', 'user_id', null],
            [Lead::query()->where('company_id', $companyId), 'created_at', 'created_by_user_id', null],
            [LeadActivity::query()->where('company_id', $companyId), 'created_at', 'created_by_user_id', null],
            [LeadNote::query()->where('company_id', $companyId), 'created_at', 'created_by_user_id', null],
            [TaskTrackingSession::query()->where('company_id', $companyId), 'start_recorded_at', 'started_by_user_id', null],
            [
                TaskProof::query()->whereHas('task', static function (Builder $query) use ($companyId): void {
                    $query->where('company_id', $companyId);
                }),
                'created_at',
                'uploaded_by_user_id',
                null,
            ],
            [Project::query()->where('company_id', $companyId), 'created_at', 'created_by_user_id', null],
        ];

        if ($role !== 'agent') {
            $sources[] = [PayrollSetting::query()->where('company_id', $companyId), 'created_at', null, null];
            $sources[] = [
                PayrollSetting::query()->where('company_id', $companyId)->whereColumn('updated_at', '!=', 'created_at'),
                'updated_at',
                null,
                null,
            ];
            $sources[] = [DB::table('company_users')->where('company_id', $companyId), 'created_at', null, null];
        }

        foreach ($sources as [$query, $dateColumn, $scopeColumn, $customScope]) {
            $this->accumulateDailyActivity(
                dailyTotals: $dailyTotals,
                query: $query,
                dateColumn: $dateColumn,
                role: $role,
                userId: $userId,
                scopeColumn: $scopeColumn,
                from: $from,
                to: $to,
                customScope: $customScope,
            );
        }
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

    /**
     * Ongoing work: tasks in progress, paused or resumed, with an assigned agent.
     *
     * Progress per task (first rule that applies):
     *  1. checklist - completed subtasks / all subtasks
     *  2. travel    - open tracking session with a destination: distance covered (arrived = 100)
     *  3. schedule  - time elapsed between started_at and due_at, capped at 95
     *  4. started   - 5, so the agent still shows on the bar
     *
     * Agents are grouped; an agent's progress is the average of their ongoing tasks.
     *
     * @return array{tasks: array<int, array<string, mixed>>, agents: array<int, array<string, mixed>>}
     */
    private function buildOngoing(int $companyId, string $role, int $userId): array
    {
        $tasksQuery = Task::query()
            ->where('company_id', $companyId)
            ->whereIn('status', ['in_progress', 'paused', 'resumed'])
            ->whereNotNull('assigned_agent_id')
            ->withCount([
                'subtasks as subtasks_total',
                'subtasks as subtasks_done' => static function (Builder $query): void {
                    $query->where('is_completed', true);
                },
            ])
            ->with([
                'assignedAgent:id,name,avatar,gender',
                'trackingSession' => static function ($query): void {
                    $query->select([
                        'task_tracking_sessions.id',
                        'task_tracking_sessions.task_id',
                        'task_tracking_sessions.start_latitude',
                        'task_tracking_sessions.start_longitude',
                        'task_tracking_sessions.last_latitude',
                        'task_tracking_sessions.last_longitude',
                        'task_tracking_sessions.destination_latitude',
                        'task_tracking_sessions.destination_longitude',
                        'task_tracking_sessions.destination_radius_meters',
                        'task_tracking_sessions.near_detected_at',
                        'task_tracking_sessions.arrival_detected_at',
                        'task_tracking_sessions.end_recorded_at',
                        'task_tracking_sessions.last_recorded_at',
                    ]);
                },
            ]);

        if ($role === 'agent') {
            $tasksQuery->where('assigned_agent_id', $userId);
        }

        $tasks = $tasksQuery
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->limit(60)
            ->get();

        $items = [];
        foreach ($tasks as $task) {
            $items[] = $this->ongoingTaskItem($task);
        }

        // Group by agent; tasks are already newest-first, so the first one is the current task.
        $groups = [];
        foreach ($items as $item) {
            $agentId = (int) $item['agent']['id'];
            if (! isset($groups[$agentId])) {
                $groups[$agentId] = ['agent' => $item['agent'], 'tasks' => []];
            }
            $groups[$agentId]['tasks'][] = $item;
        }

        $agents = [];
        foreach (array_slice(array_values($groups), 0, 8) as $group) {
            $taskList = $group['tasks'];
            $average = array_sum(array_column($taskList, 'progress_percent')) / max(1, count($taskList));
            $current = $taskList[0];

            $agents[] = [
                'agent' => $group['agent'],
                'progress_percent' => (int) round($average),
                'task_count' => count($taskList),
                'current_task' => [
                    'id' => $current['task_id'],
                    'title' => $current['task_title'],
                    'state' => $current['state'],
                    'progress_source' => $current['progress_source'],
                ],
                'tasks' => array_map(static fn (array $item): array => [
                    'id' => $item['task_id'],
                    'title' => $item['task_title'],
                    'progress_percent' => (int) round($item['progress_percent']),
                    'progress_source' => $item['progress_source'],
                    'state' => $item['state'],
                ], $taskList),
            ];
        }

        // Legacy list: most advanced first, capped like before.
        $legacy = $items;
        usort($legacy, static fn (array $a, array $b): int => $b['progress_percent'] <=> $a['progress_percent']);

        return [
            'tasks' => array_values(array_slice($legacy, 0, 12)),
            'agents' => $agents,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function ongoingTaskItem(Task $task): array
    {
        $status = $task->status instanceof \BackedEnum ? $task->status->value : (string) $task->status;
        $session = $task->trackingSession;
        $openSession = $session !== null && $session->end_recorded_at === null ? $session : null;

        $progress = 5.0;
        $source = 'started';
        $trackingState = 'in_progress';
        $totalDistanceMeters = null;
        $coveredDistanceMeters = null;
        $remainingDistanceMeters = null;

        $subtasksTotal = (int) ($task->subtasks_total ?? 0);

        if ($subtasksTotal > 0) {
            $source = 'checklist';
            $progress = ((int) ($task->subtasks_done ?? 0) / $subtasksTotal) * 100;
        }

        if ($openSession !== null) {
            $startLat = $openSession->start_latitude;
            $startLng = $openSession->start_longitude;
            $destinationLat = $openSession->destination_latitude ?? $task->latitude;
            $destinationLng = $openSession->destination_longitude ?? $task->longitude;
            $currentLat = $openSession->last_latitude ?? $startLat;
            $currentLng = $openSession->last_longitude ?? $startLng;

            if (
                $startLat !== null && $startLng !== null
                && $destinationLat !== null && $destinationLng !== null
                && $currentLat !== null && $currentLng !== null
            ) {
                $totalDistanceMeters = $this->distanceMeters((float) $startLat, (float) $startLng, (float) $destinationLat, (float) $destinationLng);
                $coveredDistanceMeters = $this->distanceMeters((float) $startLat, (float) $startLng, (float) $currentLat, (float) $currentLng);

                if ($totalDistanceMeters > 0) {
                    $coveredDistanceMeters = min($totalDistanceMeters, $coveredDistanceMeters);
                    $remainingDistanceMeters = max(0.0, $totalDistanceMeters - $coveredDistanceMeters);

                    if ($source !== 'checklist') {
                        $source = 'travel';
                        $progress = ($coveredDistanceMeters / $totalDistanceMeters) * 100;
                    }
                }
            }

            if ($openSession->arrival_detected_at !== null) {
                $trackingState = 'arrived';
                $remainingDistanceMeters = 0.0;
                if ($source !== 'checklist') {
                    $source = 'travel';
                    $progress = 100.0;
                }
            } elseif ($openSession->near_detected_at !== null) {
                $trackingState = 'near_destination';
            }
        }

        if ($source === 'started' && $task->started_at !== null && $task->due_at !== null && $task->due_at->gt($task->started_at)) {
            $planned = $task->due_at->getTimestamp() - $task->started_at->getTimestamp();
            $elapsed = now()->getTimestamp() - $task->started_at->getTimestamp();
            $source = 'schedule';
            $progress = min(95.0, max(0.0, ($elapsed / $planned) * 100));
        }

        $state = match (true) {
            $status === 'paused' => 'paused',
            $trackingState === 'arrived' => 'arrived',
            $trackingState === 'near_destination' => 'near_destination',
            default => 'active',
        };

        $statusLabel = match ($state) {
            'paused' => 'PAUSED',
            'arrived' => 'ARRIVED',
            'near_destination' => 'NEAR DESTINATION',
            default => 'ACTIVE',
        };

        $assignedAgent = $task->assignedAgent;
        $agentName = trim((string) ($assignedAgent?->name ?: 'Unknown Agent'));
        $initials = '';
        foreach (array_slice(preg_split('/\s+/', $agentName) ?: [], 0, 2) as $part) {
            if ($part !== '') {
                $initials .= strtoupper(substr($part, 0, 1));
            }
        }

        return [
            'task_id' => (int) $task->id,
            'task_title' => (string) $task->title,
            'status' => $statusLabel,
            'state' => $state,
            'tracking_state' => $trackingState,
            'progress_source' => $source,
            'progress_percent' => round(max(0.0, min(100.0, $progress)), 2),
            'total_distance_meters' => $totalDistanceMeters !== null ? round($totalDistanceMeters, 2) : null,
            'covered_distance_meters' => $coveredDistanceMeters !== null ? round($coveredDistanceMeters, 2) : null,
            'remaining_distance_meters' => $remainingDistanceMeters !== null ? round($remainingDistanceMeters, 2) : null,
            'eta_minutes' => null,
            'agent' => [
                'id' => $assignedAgent?->id ?? (int) $task->assigned_agent_id,
                'name' => $agentName,
                'avatar_url' => AvatarUrlResolver::resolveOrDefault($assignedAgent?->avatar, $assignedAgent?->gender),
                'initials' => $initials !== '' ? $initials : 'A',
            ],
        ];
    }

    /**
     * Top leads: leads active in the window, ranked by stage progress (won = 100),
     * then priority (urgent > high > medium > low), then budget, then latest activity.
     *
     * @return array<int, array<string, mixed>>
     */
    private function buildTopProspects(int $companyId, string $role, int $userId, Carbon $from, Carbon $to): array
    {
        $query = Lead::query()
            ->where('company_id', $companyId)
            ->whereBetween('updated_at', [$from, $to]);

        if ($role === 'agent') {
            $this->applyAgentLeadScope($query, $userId);
        }

        $candidates = $query
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->limit(200)
            ->get(['id', 'name', 'status', 'priority', 'assigned_to_user_id', 'budget_amount', 'updated_at']);

        $progressBySlug = $this->buildStageProgress($companyId);
        $namesBySlug = LeadLabel::query()
            ->where('company_id', $companyId)
            ->pluck('name', 'slug')
            ->all();
        $priorityRank = ['urgent' => 4, 'high' => 3, 'medium' => 2, 'low' => 1];

        $rows = $candidates->map(static function (Lead $lead) use ($progressBySlug, $namesBySlug, $priorityRank): array {
            $priority = $lead->priority instanceof \BackedEnum
                ? $lead->priority->value
                : ($lead->priority !== null ? (string) $lead->priority : null);
            $status = (string) $lead->status;

            return [
                'id' => $lead->id,
                'name' => $lead->name,
                'status' => $status,
                'stage_name' => $namesBySlug[$status] ?? null,
                'progress' => (int) ($progressBySlug[$status] ?? 0),
                'priority' => $priority,
                'assigned_to_user_id' => $lead->assigned_to_user_id,
                '_priority_rank' => $priorityRank[strtolower((string) $priority)] ?? 0,
                '_budget' => (float) ($lead->budget_amount ?? 0),
                '_updated' => $lead->updated_at?->getTimestamp() ?? 0,
            ];
        })->all();

        usort($rows, static function (array $a, array $b): int {
            return [$b['progress'], $b['_priority_rank'], $b['_budget'], $b['_updated'], $b['id']]
                <=> [$a['progress'], $a['_priority_rank'], $a['_budget'], $a['_updated'], $a['id']];
        });

        return array_map(static function (array $row): array {
            unset($row['_priority_rank'], $row['_budget'], $row['_updated']);

            return $row;
        }, array_slice($rows, 0, 5));
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

    /**
     * Progress (0-100) of each CRM stage, from its position in the company's label order.
     * Won stages are always 100.
     *
     * @return array<string, int>
     */
    private function buildStageProgress(int $companyId): array
    {
        $labels = LeadLabel::query()
            ->where('company_id', $companyId)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get(['slug', 'is_won']);

        $ordinary = $labels->reject(static fn (LeadLabel $label): bool => (bool) $label->is_won)->values();
        $steps = max(1, $ordinary->count());
        $progress = [];

        foreach ($ordinary as $index => $label) {
            $progress[(string) $label->slug] = (int) round((($index + 1) / ($steps + 1)) * 100);
        }

        foreach ($labels as $label) {
            if ((bool) $label->is_won) {
                $progress[(string) $label->slug] = 100;
            }
        }

        return $progress;
    }

    /**
     * @return array<int, array{name: string, v1: int, v2: int}>
     */
    private function buildLeadsTrend(int $companyId, string $role, int $userId): array
    {
        $query = Lead::query()->where('company_id', $companyId);

        if ($role === 'agent') {
            $this->applyAgentLeadScope($query, $userId);
        }

        $points = [];

        for ($offset = 5; $offset >= 0; $offset--) {
            $dayStart = now()->subDays($offset)->startOfDay();
            $dayEnd = $dayStart->copy()->endOfDay();
            $created = (int) (clone $query)
                ->whereBetween('created_at', [$dayStart, $dayEnd])
                ->count();
            $converted = (int) (clone $query)
                ->whereBetween('converted_at', [$dayStart, $dayEnd])
                ->count();

            $points[] = [
                'name' => $dayStart->format('D'),
                'date' => $dayStart->toDateString(),
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
