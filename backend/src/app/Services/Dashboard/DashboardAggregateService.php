<?php

declare(strict_types=1);

namespace App\Services\Dashboard;

use App\Enums\LeadStatus;
use App\Models\Lead;
use App\Models\PayrollSetting;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskLocationPoint;
use App\Models\User;
use App\Services\Analytics\AggregateCacheService;
use App\Services\Company\CompanyContextService;
use Carbon\Carbon;

class DashboardAggregateService
{
    public function __construct(
        private readonly CompanyContextService $companyContextService,
        private readonly AggregateCacheService $cacheService,
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
            resolver: function () use ($resolvedCompanyId, $user, $from, $to): array {
                $tasksInWindow = Task::query()
                    ->where('company_id', $resolvedCompanyId)
                    ->whereBetween('created_at', [$from->copy()->startOfDay(), $to->copy()->endOfDay()]);

                $allTasks = Task::query()->where('company_id', $resolvedCompanyId);
                $allProjects = Project::query()->where('company_id', $resolvedCompanyId);

                $allLeads = Lead::query()->where('company_id', $resolvedCompanyId);
                $leadsInWindow = Lead::query()
                    ->where('company_id', $resolvedCompanyId)
                    ->whereBetween('created_at', [$from->copy()->startOfDay(), $to->copy()->endOfDay()]);

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
                        ->whereIn('status', [
                            LeadStatus::NEW->value,
                            LeadStatus::CONTACTED->value,
                            LeadStatus::QUALIFIED->value,
                            LeadStatus::PROPOSAL_SENT->value,
                        ])
                        ->orderByDesc('updated_at')
                        ->limit(5)
                        ->get(['id', 'name', 'status', 'priority', 'assigned_to_user_id'])
                        ->map(static fn(Lead $lead): array => [
                            'id' => $lead->id,
                            'name' => $lead->name,
                            'status' => $lead->status?->value,
                            'priority' => $lead->priority?->value,
                            'assigned_to_user_id' => $lead->assigned_to_user_id,
                        ])
                        ->values()
                        ->all(),
                    'crm_pipeline_snapshot' => $this->pipelineSnapshot($resolvedCompanyId),
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
                ];
            },
        );
    }

    private function pipelineSnapshot(int $companyId): array
    {
        $counts = Lead::query()
            ->where('company_id', $companyId)
            ->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status')
            ->all();

        return [
            'total' => (int) array_sum(array_map(static fn($value): int => (int) $value, $counts)),
            'stages' => [
                ['status' => LeadStatus::NEW->value, 'count' => (int) ($counts[LeadStatus::NEW->value] ?? 0)],
                ['status' => LeadStatus::CONTACTED->value, 'count' => (int) ($counts[LeadStatus::CONTACTED->value] ?? 0)],
                ['status' => LeadStatus::QUALIFIED->value, 'count' => (int) ($counts[LeadStatus::QUALIFIED->value] ?? 0)],
                ['status' => LeadStatus::PROPOSAL_SENT->value, 'count' => (int) ($counts[LeadStatus::PROPOSAL_SENT->value] ?? 0)],
                ['status' => LeadStatus::WON->value, 'count' => (int) ($counts[LeadStatus::WON->value] ?? 0)],
                ['status' => LeadStatus::LOST->value, 'count' => (int) ($counts[LeadStatus::LOST->value] ?? 0)],
            ],
        ];
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
