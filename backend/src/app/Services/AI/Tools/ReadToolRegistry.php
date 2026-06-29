<?php

declare(strict_types=1);

namespace App\Services\AI\Tools;

use App\Enums\ProjectStatus;
use App\Enums\TaskStatus;
use App\Models\CrmEmailMessage;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Services\AI\Crm\EmailInferenceService;
use App\Services\AI\Crm\CrmIntelligenceService;
use App\Services\AI\Crm\VisitAssistantService;
use App\Services\AI\Kpi\TeamPerformanceService;
use App\Services\AI\Planning\DailyPlanningService;
use App\Services\Attendance\AttendanceService;
use App\Services\Calendar\MeetingService;
use App\Services\Company\CompanyContextService;
use App\Services\Crm\CrmEmailService;
use App\Services\Crm\LeadService;
use App\Services\Dashboard\DashboardAggregateService;
use App\Services\Tracking\AgentLocationSnapshotService;
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
        private readonly CrmEmailService $crmEmailService,
        private readonly EmailInferenceService $emailInferenceService,
        private readonly VisitAssistantService $visitAssistantService,
        private readonly TeamPerformanceService $teamPerformanceService,
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
            'crm.email_threads' => $this->emailThreads($user, $companyId, $args),
            'crm.unread_emails' => $this->unreadEmails($user, $companyId, $args),
            'crm.draft_email' => $this->draftEmail($user, $companyId, $args),
            'kpi.team_performance' => $this->teamPerformanceService->analyze($user, $companyId, $args),
            'org.users' => $this->organizationUsers($user, $companyId, $args),
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

        $assigneeNames = User::query()
            ->whereIn(
                'id',
                collect($leads->items())
                    ->pluck('assigned_to_user_id')
                    ->filter(static fn($id): bool => is_numeric($id) && (int) $id > 0)
                    ->map(static fn($id): int => (int) $id)
                    ->unique()
                    ->values()
                    ->all()
            )
            ->pluck('name', 'id');

        $items = collect($leads->items())
            ->map(static function ($lead) use ($assigneeNames): array {
                $assignedToUserId = is_numeric($lead->assigned_to_user_id ?? null) ? (int) $lead->assigned_to_user_id : null;

                return [
                    'id' => (int) $lead->id,
                    'name' => (string) $lead->name,
                    'status' => $lead->status?->value ?? (is_string($lead->status) ? $lead->status : null),
                    'priority' => $lead->priority?->value,
                    'assigned_to_user_id' => $assignedToUserId,
                    'assigned_to_name' => $assignedToUserId !== null
                        ? (string) ($assigneeNames->get($assignedToUserId) ?? '')
                        : null,
                    'phone' => is_string($lead->phone ?? null) ? $lead->phone : null,
                    'location' => is_string($lead->location ?? null) ? $lead->location : null,
                    'company_id' => (int) $lead->company_id,
                ];
            })
            ->values()
            ->all();

        $total = method_exists($leads, 'total') ? (int) $leads->total() : count($items);
        $summary = $this->formatLeadListSummary($items, $total);

        return [
            'tool' => 'crm.top_leads',
            'summary' => $summary,
            'payload' => [
                'items' => $items,
                'count' => count($items),
                'total' => $total,
            ],
            'sources' => ['crm.top_leads'],
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $items
     */
    private function formatLeadListSummary(array $items, int $total): string
    {
        if ($total <= 0) {
            return 'No leads were found in your active organization scope.';
        }

        $lines = collect($items)
            ->values()
            ->map(static function (array $lead, int $index): string {
                $status = is_string($lead['status'] ?? null) ? $lead['status'] : 'unknown';
                $priority = is_string($lead['priority'] ?? null) ? $lead['priority'] : 'unknown';
                $assignee = is_string($lead['assigned_to_name'] ?? null) && trim($lead['assigned_to_name']) !== ''
                    ? (string) $lead['assigned_to_name']
                    : 'unassigned';

                return sprintf(
                    '%d. %s, Status: %s, Priority: %s, Assigned: %s',
                    $index + 1,
                    (string) ($lead['name'] ?? 'Lead'),
                    $status,
                    $priority,
                    $assignee,
                );
            })
            ->all();

        $header = $total > count($items)
            ? sprintf('You have %d lead(s) in your CRM. Showing %d in your active scope:', $total, count($items))
            : sprintf('You have %d lead(s) in your CRM:', $total);

        return $header . "\n" . implode("\n", $lines);
    }

    private function organizationUsers(User $user, int $companyId, array $args): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $limit = max(1, min(50, (int) ($args['limit'] ?? 25)));

        $users = User::query()
            ->select(['users.id', 'users.name', 'users.email'])
            ->selectRaw('company_users.role as company_role')
            ->join(
                'company_users',
                static fn($join) => $join
                    ->on('company_users.user_id', '=', 'users.id')
                    ->where('company_users.company_id', '=', $resolvedCompanyId)
            )
            ->orderByRaw("case when company_users.role = 'owner' then 0 when company_users.role = 'admin' then 1 when company_users.role = 'supervisor' then 2 when company_users.role = 'agent' then 3 else 4 end")
            ->orderBy('users.name')
            ->limit($limit)
            ->get();

        $items = $users
            ->map(static fn(User $member): array => [
                'id' => (int) $member->id,
                'name' => (string) $member->name,
                'email' => (string) ($member->email ?? ''),
                'role' => is_string($member->company_role ?? null) ? (string) $member->company_role : null,
            ])
            ->values()
            ->all();

        $summary = $this->formatOrganizationUsersSummary($items);

        return [
            'tool' => 'org.users',
            'summary' => $summary,
            'payload' => [
                'items' => $items,
                'count' => count($items),
            ],
            'sources' => ['org.users'],
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $items
     */
    private function formatOrganizationUsersSummary(array $items): string
    {
        if ($items === []) {
            return 'No users were found in your active organization scope.';
        }

        $lines = collect($items)
            ->values()
            ->map(static function (array $member, int $index): string {
                $role = is_string($member['role'] ?? null) && trim($member['role']) !== ''
                    ? (string) $member['role']
                    : 'member';
                $email = is_string($member['email'] ?? null) ? (string) $member['email'] : '';

                return sprintf(
                    '%d. %s (%s)%s',
                    $index + 1,
                    (string) ($member['name'] ?? 'User'),
                    $role,
                    $email !== '' ? ', ' . $email : '',
                );
            })
            ->all();

        return sprintf("Here are %d user(s) in your organization:\n%s", count($items), implode("\n", $lines));
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

    private function emailThreads(User $user, int $companyId, array $args): array
    {
        $leadId = isset($args['lead_id']) ? (int) $args['lead_id'] : null;

        if ($leadId === null) {
            return [
                'tool' => 'crm.email_threads',
                'summary' => 'Please specify a lead_id to summarize email threads.',
                'payload' => [],
                'sources' => ['crm.email_threads'],
            ];
        }

        $lead = \App\Models\Lead::query()->where('company_id', $companyId)->findOrFail($leadId);
        $threads = $this->crmEmailService->listThreadsForLead($user, $lead, [
            'company_id' => $companyId,
            'per_page' => 10,
        ]);

        return [
            'tool' => 'crm.email_threads',
            'summary' => 'Lead email thread summary is ready.',
            'payload' => [
                'lead_id' => $leadId,
                'items' => $threads->items(),
            ],
            'sources' => ['crm.email_threads'],
        ];
    }

    private function unreadEmails(User $user, int $companyId, array $args): array
    {
        $stats = $this->crmEmailService->emailStats($user, $companyId);
        $activity = $this->crmEmailService->recentActivity($user, $companyId, 10);

        $unreadMessages = CrmEmailMessage::query()
            ->where('company_id', $companyId)
            ->where('is_read', false)
            ->where('direction', 'received')
            ->latest('id')
            ->limit(10)
            ->get(['id', 'lead_id', 'subject', 'from_email', 'received_at']);

        return [
            'tool' => 'crm.unread_emails',
            'summary' => ($stats['unread_crm_emails'] ?? 0) . ' unread CRM emails found.',
            'payload' => [
                'stats' => $stats,
                'recent_activity' => $activity,
                'unread_messages' => $unreadMessages,
            ],
            'sources' => ['crm.unread_emails'],
        ];
    }

    private function draftEmail(User $user, int $companyId, array $args): array
    {
        $message = trim((string) ($args['message'] ?? ''));
        $draft = $this->emailInferenceService->infer(
            message: $message,
            companyId: $companyId,
            entities: is_array($args['entities'] ?? null) ? $args['entities'] : [],
        );

        return [
            'tool' => 'crm.draft_email',
            'summary' => 'Draft email prepared. Confirm to send with crm.send_email.',
            'payload' => [
                ...$draft,
                'suggested_action_tool' => 'crm.send_email',
                'requires_confirmation' => true,
            ],
            'sources' => ['crm.draft_email'],
        ];
    }
}
