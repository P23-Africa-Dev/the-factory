<?php

declare(strict_types=1);

namespace App\Services\AI\Tools;

use App\Enums\ProjectStatus;
use App\Enums\TaskStatus;
use App\Models\Project;
use App\Models\Task;
use App\Services\AI\Crm\CrmIntelligenceService;
use App\Services\AI\Crm\VisitAssistantService;
use App\Services\AI\Planning\DailyPlanningService;
use App\Services\Attendance\AttendanceService;
use App\Services\Calendar\MeetingService;
use App\Services\Company\CompanyContextService;
use App\Services\Crm\LeadService;
use App\Services\Dashboard\DashboardAggregateService;
use App\Services\Tracking\AgentLocationSnapshotService;
use App\Models\User;
use Illuminate\Contracts\Pagination\Paginator;
use Illuminate\Database\Eloquent\Builder;

class ReadToolRegistry
{
    public function __construct(
        private readonly CompanyContextService $companyContextService,
        private readonly LeadService $leadService,
        private readonly AttendanceService $attendanceService,
        private readonly MeetingService $meetingService,
        private readonly AgentLocationSnapshotService $agentLocationSnapshotService,
        private readonly DashboardAggregateService $dashboardAggregateService,
        private readonly DailyPlanningService $dailyPlanningService,
        private readonly CrmIntelligenceService $crmIntelligenceService,
        private readonly VisitAssistantService $visitAssistantService,
    ) {}

    public function execute(string $tool, User $user, int $companyId, array $args = []): array
    {
        return match ($tool) {
            'crm.top_leads' => $this->topLeads($user, $companyId, $args),
            'tasks.overdue' => $this->overdueTasks($user, $companyId, $args),
            'projects.at_risk_summary' => $this->projectRiskSummary($user, $companyId, $args),
            'attendance.today_summary' => $this->attendanceSummary($user, $companyId),
            'meetings.today' => $this->meetingsToday($user, $companyId, $args),
            'tracking.active_agents' => $this->activeAgents($user, $companyId, $args),
            'dashboard.overview' => $this->dashboardOverview($user, $companyId),
            'planning.daily' => $this->dailyPlanningService->buildPlan($user, $companyId, $args),
            'crm.follow_up_summary' => $this->crmIntelligenceService->followUpSummary($user, $companyId, $args),
            'crm.stale_leads' => $this->crmIntelligenceService->staleLeads($user, $companyId, $args),
            'crm.visit_extract' => $this->visitAssistantService->extractVisitNotes($user, $companyId, $args),
            default => [
                'tool' => $tool,
                'summary' => 'Unsupported read tool requested.',
                'payload' => [],
                'sources' => [],
            ],
        };
    }

    private function topLeads(User $user, int $companyId, array $args): array
    {
        $limit = max(1, min(20, (int) ($args['limit'] ?? 5)));

        /** @var Paginator $leads */
        $leads = $this->leadService->listForUser($user, [
            'company_id' => $companyId,
            'per_page' => $limit,
        ]);

        $items = collect($leads->items())
            ->map(static fn($lead): array => [
                'id' => (int) $lead->id,
                'name' => (string) $lead->name,
                'status' => $lead->status?->value,
                'priority' => $lead->priority?->value,
                'assigned_to_user_id' => $lead->assigned_to_user_id,
                'company_id' => (int) $lead->company_id,
            ])
            ->values()
            ->all();

        $total = method_exists($leads, 'total') ? (int) $leads->total() : count($items);

        return [
            'tool' => 'crm.top_leads',
            'summary' => $total > 0
                ? "You currently have {$total} lead(s) in your CRM. Here are the top records in your active scope."
                : 'No leads were found in your active organization scope.',
            'payload' => [
                'items' => $items,
                'count' => count($items),
                'total' => $total,
            ],
            'sources' => ['crm.top_leads'],
        ];
    }

    private function overdueTasks(User $user, int $companyId, array $args): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $role = (string) $context['role'];
        $resolvedCompanyId = (int) $context['company']->id;
        $limit = max(1, min(30, (int) ($args['limit'] ?? 10)));

        $query = Task::query()
            ->where('company_id', $resolvedCompanyId)
            ->whereNotNull('due_at')
            ->where('due_at', '<', now())
            ->whereNotIn('status', [TaskStatus::COMPLETED->value, TaskStatus::CANCELLED->value])
            ->orderBy('due_at')
            ->limit($limit);

        if ($role === 'agent') {
            $query->where(function (Builder $builder) use ($user): void {
                $builder->where('assigned_agent_id', $user->id)
                    ->orWhereExists(function ($sub) use ($user): void {
                        $sub->selectRaw('1')
                            ->from('task_assignments')
                            ->whereColumn('task_assignments.task_id', 'tasks.id')
                            ->where('task_assignments.assigned_agent_id', $user->id)
                            ->where('task_assignments.is_current', true);
                    });
            });
        }

        $items = $query->get(['id', 'title', 'status', 'priority', 'due_at', 'assigned_agent_id', 'project_id'])
            ->map(static fn(Task $task): array => [
                'id' => $task->id,
                'title' => $task->title,
                'status' => $task->status?->value,
                'priority' => $task->priority?->value,
                'due_at' => $task->due_at?->toIso8601String(),
                'assigned_agent_id' => $task->assigned_agent_id,
                'project_id' => $task->project_id,
            ])
            ->values()
            ->all();

        return [
            'tool' => 'tasks.overdue',
            'summary' => count($items) > 0
                ? 'I found overdue tasks in your permitted scope.'
                : 'No overdue tasks found in your permitted scope.',
            'payload' => [
                'items' => $items,
                'count' => count($items),
            ],
            'sources' => ['tasks.overdue'],
        ];
    }

    private function projectRiskSummary(User $user, int $companyId, array $args): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $role = (string) $context['role'];
        $resolvedCompanyId = (int) $context['company']->id;
        $limit = max(1, min(20, (int) ($args['limit'] ?? 8)));

        $projectQuery = Project::query()
            ->where('company_id', $resolvedCompanyId)
            ->withCount([
                'tasks as overdue_tasks_count' => function (Builder $query): void {
                    $query->whereNotNull('due_at')
                        ->where('due_at', '<', now())
                        ->whereNotIn('status', [TaskStatus::COMPLETED->value, TaskStatus::CANCELLED->value]);
                },
                'tasks as total_tasks_count',
                'tasks as completed_tasks_count' => fn(Builder $query) => $query->where('status', TaskStatus::COMPLETED->value),
            ])
            ->orderByDesc('overdue_tasks_count')
            ->orderBy('end_date')
            ->limit($limit);

        if ($role === 'agent') {
            $projectQuery->whereHas('tasks', function (Builder $query) use ($user): void {
                $query->where(function (Builder $nested) use ($user): void {
                    $nested->where('tasks.assigned_agent_id', $user->id)
                        ->orWhereExists(function ($sub) use ($user): void {
                            $sub->selectRaw('1')
                                ->from('task_assignments')
                                ->whereColumn('task_assignments.task_id', 'tasks.id')
                                ->where('task_assignments.assigned_agent_id', $user->id)
                                ->where('task_assignments.is_current', true);
                        });
                });
            });
        }

        $items = $projectQuery->get(['id', 'name', 'status', 'start_date', 'end_date'])
            ->map(static fn(Project $project): array => [
                'id' => $project->id,
                'name' => $project->name,
                'status' => $project->status?->value,
                'start_date' => $project->start_date?->toDateString(),
                'end_date' => $project->end_date?->toDateString(),
                'overdue_tasks_count' => (int) ($project->overdue_tasks_count ?? 0),
                'total_tasks_count' => (int) ($project->total_tasks_count ?? 0),
                'completed_tasks_count' => (int) ($project->completed_tasks_count ?? 0),
                'is_behind_schedule' => $project->status !== ProjectStatus::COMPLETED
                    && $project->end_date !== null
                    && $project->end_date->isPast(),
            ])
            ->values()
            ->all();

        return [
            'tool' => 'projects.at_risk_summary',
            'summary' => count($items) > 0
                ? 'Here is the at-risk project snapshot from your active scope.'
                : 'No project risk records were found in your active scope.',
            'payload' => [
                'items' => $items,
                'count' => count($items),
            ],
            'sources' => ['projects.at_risk_summary'],
        ];
    }

    private function attendanceSummary(User $user, int $companyId): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $role = (string) $context['role'];
        $resolvedCompanyId = (int) $context['company']->id;

        $payload = $role === 'agent'
            ? $this->attendanceService->todayForAgent($user, $resolvedCompanyId)
            : $this->attendanceService->metricsForManagement($user, [
                'company_id' => $resolvedCompanyId,
                'date' => now()->toDateString(),
            ]);

        return [
            'tool' => 'attendance.today_summary',
            'summary' => 'Attendance summary for today is ready.',
            'payload' => $payload,
            'sources' => ['attendance.today_summary'],
        ];
    }

    private function meetingsToday(User $user, int $companyId, array $args): array
    {
        $limit = max(1, min(25, (int) ($args['limit'] ?? 10)));

        /** @var Paginator $meetings */
        $meetings = $this->meetingService->listForUser($user, [
            'company_id' => $companyId,
            'from' => now()->startOfDay()->toIso8601String(),
            'to' => now()->endOfDay()->toIso8601String(),
            'per_page' => $limit,
        ]);

        $items = collect($meetings->items())
            ->map(static fn($meeting): array => [
                'id' => (int) $meeting->id,
                'title' => (string) $meeting->title,
                'status' => (string) $meeting->status,
                'start_at' => optional($meeting->start_at)?->toIso8601String(),
                'end_at' => optional($meeting->end_at)?->toIso8601String(),
                'timezone' => (string) $meeting->timezone,
            ])
            ->values()
            ->all();

        return [
            'tool' => 'meetings.today',
            'summary' => count($items) > 0
                ? 'These are the meetings scheduled for today in your permitted scope.'
                : 'No meetings are scheduled for today in your permitted scope.',
            'payload' => [
                'items' => $items,
                'count' => count($items),
            ],
            'sources' => ['meetings.today'],
        ];
    }

    private function activeAgents(User $user, int $companyId, array $args): array
    {
        $limit = max(1, min(100, (int) ($args['limit'] ?? 50)));

        $active = $this->agentLocationSnapshotService->listForUser($user, [
            'company_id' => $companyId,
            'limit' => $limit,
            'include_offline' => false,
        ]);

        return [
            'tool' => 'tracking.active_agents',
            'summary' => count($active['items'] ?? []) > 0
                ? 'Live active agent locations are available now.'
                : 'No active agents are currently online in the selected scope.',
            'payload' => $active,
            'sources' => ['tracking.active_agents'],
        ];
    }

    private function dashboardOverview(User $user, int $companyId): array
    {
        $overview = $this->dashboardAggregateService->overview($user, $companyId);

        return [
            'tool' => 'dashboard.overview',
            'summary' => 'Dashboard overview is ready.',
            'payload' => $overview,
            'sources' => ['dashboard.overview'],
        ];
    }
}
