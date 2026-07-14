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
use App\Services\AI\Crm\VisitAssistantService;
use App\Services\AI\Kpi\TeamPerformanceService;
use App\Services\AI\Planning\DailyPlanningService;
use App\Services\Attendance\AttendanceService;
use App\Services\Calendar\MeetingService;
use App\Services\Company\CompanyContextService;
use App\Services\Crm\CrmEmailService;
use App\Services\Crm\LeadService;
use App\Services\AI\Crm\CrmIntelligenceService;
use App\Services\AI\Support\DriveFileContentReader;
use App\Services\AI\Support\ReadListPresenter;
use App\Services\Dashboard\DashboardAggregateService;
use App\Services\Drive\CompanyDriveService;
use App\Support\UserDisplayNameResolver;
use App\Services\Tracking\AgentLocationSnapshotService;
use Illuminate\Contracts\Pagination\Paginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

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
        private readonly UserDisplayNameResolver $userDisplayNameResolver,
        private readonly ReadListPresenter $readListPresenter,
        private readonly CompanyDriveService $companyDriveService,
        private readonly DriveFileContentReader $driveFileContentReader,
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
            'drive.files' => $this->driveFiles($user, $companyId, $args),
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
        $namedLeads = is_array($args['named_leads'] ?? null) ? $args['named_leads'] : [];
        $namedLeads = array_values(array_filter(
            array_map(static fn (mixed $name): string => trim((string) $name), $namedLeads),
            static fn (string $name): bool => $name !== '',
        ));

        if ($namedLeads !== []) {
            return $this->topLeadsByName($user, $companyId, $namedLeads, $args);
        }

        $limit = max(1, min($this->readListPresenter->maxExpandedLimit('crm.top_leads'), (int) ($args['limit'] ?? $this->readListPresenter->previewLimit())));
        $search = is_string($args['search'] ?? null) ? trim((string) $args['search']) : '';
        $countOnly = ($args['count_only'] ?? false) === true;

        $filters = [
            'company_id' => $companyId,
            'per_page' => $limit,
        ];

        if ($search !== '') {
            $filters['search'] = $search;
        }

        /** @var Paginator $leads */
        $leads = $this->leadService->listForUser($user, $filters);
        $items = $this->mapLeadItems($leads->items());

        $matchedTotal = method_exists($leads, 'total') ? (int) $leads->total() : count($items);
        $organizationTotal = $matchedTotal;

        if ($search !== '') {
            /** @var Paginator $allLeads */
            $allLeads = $this->leadService->listForUser($user, [
                'company_id' => $companyId,
                'per_page' => 1,
            ]);
            $organizationTotal = method_exists($allLeads, 'total') ? (int) $allLeads->total() : $matchedTotal;
        }

        $payload = $this->readListPresenter->enrichPayload(
            items: $items,
            total: $matchedTotal,
            matchedTotal: $search !== '' ? $matchedTotal : null,
            organizationTotal: $search !== '' ? $organizationTotal : null,
        );

        if ($search !== '') {
            $payload['search'] = $search;
        }

        if ($countOnly) {
            $payload['count_only'] = true;
        }

        $summary = $this->formatLeadListSummary(
            items: $items,
            payload: $payload,
            search: $search !== '' ? $search : null,
            countOnly: $countOnly,
        );

        return [
            'tool' => 'crm.top_leads',
            'summary' => $summary,
            'payload' => $payload,
            'sources' => ['crm.top_leads'],
        ];
    }

    /**
     * @param  array<int, string>  $namedLeads
     * @param  array<string, mixed>  $args
     */
    private function topLeadsByName(User $user, int $companyId, array $namedLeads, array $args): array
    {
        $limit = max(1, min($this->readListPresenter->maxExpandedLimit('crm.top_leads'), (int) ($args['limit'] ?? $this->readListPresenter->previewLimit())));
        $foundById = [];
        $foundNames = [];
        $notFound = [];

        foreach ($namedLeads as $requestedName) {
            /** @var Paginator $leads */
            $leads = $this->leadService->listForUser($user, [
                'company_id' => $companyId,
                'per_page' => $limit,
                'search' => $requestedName,
            ]);

            $matched = collect($leads->items())
                ->first(static function ($lead) use ($requestedName): bool {
                    $leadName = strtolower(trim((string) ($lead->name ?? '')));
                    $needle = strtolower(trim($requestedName));

                    return $leadName === $needle
                        || str_contains($leadName, $needle)
                        || str_contains($needle, $leadName);
                });

            if ($matched === null) {
                $notFound[] = $requestedName;
                continue;
            }

            $leadId = (int) $matched->id;
            if (! isset($foundById[$leadId])) {
                $foundById[$leadId] = $matched;
                $foundNames[] = (string) $matched->name;
            }
        }

        $items = $this->mapLeadItems(array_values($foundById));
        $summary = $this->formatNamedLeadLookupSummary($items, $namedLeads, $foundNames, $notFound);

        return [
            'tool' => 'crm.top_leads',
            'summary' => $summary,
            'payload' => [
                'items' => $items,
                'count' => count($items),
                'total' => count($items),
                'truncated' => false,
                'named_leads' => $namedLeads,
                'found' => $foundNames,
                'not_found' => $notFound,
            ],
            'sources' => ['crm.top_leads'],
        ];
    }

    /**
     * @param  array<int, mixed>  $leadModels
     * @return array<int, array<string, mixed>>
     */
    private function mapLeadItems(array $leadModels): array
    {
        $assigneeNames = $this->userDisplayNameResolver->resolveMap(
            collect($leadModels)
                ->pluck('assigned_to_user_id')
                ->all(),
        );

        return collect($leadModels)
            ->map(static function ($lead) use ($assigneeNames): array {
                $assignedToUserId = is_numeric($lead->assigned_to_user_id ?? null) ? (int) $lead->assigned_to_user_id : null;

                return [
                    'id' => (int) $lead->id,
                    'name' => (string) $lead->name,
                    'status' => $lead->status?->value ?? (is_string($lead->status) ? $lead->status : null),
                    'priority' => $lead->priority?->value,
                    'assigned_to_user_id' => $assignedToUserId,
                    'assigned_to_name' => $assignedToUserId !== null && trim((string) ($assigneeNames[$assignedToUserId] ?? '')) !== ''
                        ? (string) $assigneeNames[$assignedToUserId]
                        : null,
                    'phone' => is_string($lead->phone ?? null) ? $lead->phone : null,
                    'location' => is_string($lead->location ?? null) ? $lead->location : null,
                    'company_id' => (int) $lead->company_id,
                ];
            })
            ->values()
            ->all();
    }

    /**
     * @param  array<int, array<string, mixed>>  $items
     * @param  array<int, string>  $requestedNames
     * @param  array<int, string>  $foundNames
     * @param  array<int, string>  $notFound
     */
    private function formatNamedLeadLookupSummary(
        array $items,
        array $requestedNames,
        array $foundNames,
        array $notFound,
    ): string {
        $lines = collect($items)
            ->values()
            ->map(fn (array $lead, int $index): string => $this->formatLeadSummaryLine($lead, $index))
            ->all();

        $header = sprintf(
            'Searched for %d named lead(s). Found %d, not found %d.',
            count($requestedNames),
            count($foundNames),
            count($notFound),
        );

        if ($notFound !== []) {
            $header .= ' Not found: ' . implode(', ', $notFound) . '.';
        }

        if ($lines === []) {
            return $header;
        }

        return $header . "\n" . implode("\n", $lines);
    }

    private function formatLeadSummaryLine(array $lead, int $index): string
    {
        $status = is_string($lead['status'] ?? null) ? $lead['status'] : 'unknown';
        $priority = is_string($lead['priority'] ?? null) ? $lead['priority'] : 'unknown';
        $assignee = is_string($lead['assigned_to_name'] ?? null) && trim($lead['assigned_to_name']) !== ''
            ? (string) $lead['assigned_to_name']
            : 'unassigned';
        $location = is_string($lead['location'] ?? null) && trim($lead['location']) !== ''
            ? (string) $lead['location']
            : 'no location on file';

        return sprintf(
            '%d. %s — %s — Status: %s, Priority: %s, Assigned: %s',
            $index + 1,
            (string) ($lead['name'] ?? 'Lead'),
            $location,
            $status,
            $priority,
            $assignee,
        );
    }

    /**
     * @param  array<int, array<string, mixed>>  $items
     * @param  array<string, mixed>  $payload
     */
    private function formatLeadListSummary(
        array $items,
        array $payload,
        ?string $search = null,
        bool $countOnly = false,
    ): string {
        $scopeTotal = is_int($payload['matched_total'] ?? null)
            ? (int) $payload['matched_total']
            : (int) ($payload['total'] ?? count($items));
        $organizationTotal = is_int($payload['total'] ?? null) ? (int) $payload['total'] : $scopeTotal;
        $truncated = ($payload['truncated'] ?? false) === true;
        $remainingCount = (int) ($payload['remaining_count'] ?? 0);

        $header = $this->readListPresenter->formatListHeader(
            resourceLabel: 'lead(s)',
            shownCount: count($items),
            scopeTotal: $scopeTotal,
            filterLabel: $search,
            truncated: $truncated,
            remainingCount: $remainingCount,
            organizationTotal: $search !== null ? $organizationTotal : null,
        );

        if ($countOnly && $items === []) {
            return rtrim($header, ':') . '.';
        }

        if ($countOnly && count($items) <= 3) {
            $lines = collect($items)
                ->values()
                ->map(fn (array $lead, int $index): string => $this->formatLeadSummaryLine($lead, $index))
                ->all();

            return rtrim($header, ':') . ":\n" . implode("\n", $lines);
        }

        if ($countOnly) {
            return rtrim($header, ':') . '.';
        }

        if ($items === []) {
            return rtrim($header, ':') . '.';
        }

        $lines = collect($items)
            ->values()
            ->map(fn (array $lead, int $index): string => $this->formatLeadSummaryLine($lead, $index))
            ->all();

        $footer = $truncated
            ? "\nWould you like me to list all of them?"
            : '';

        return $header . "\n" . implode("\n", $lines) . $footer;
    }

    private function organizationUsers(User $user, int $companyId, array $args): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $limit = max(1, min($this->readListPresenter->maxExpandedLimit('org.users'), (int) ($args['limit'] ?? $this->readListPresenter->previewLimit())));
        $countOnly = ($args['count_only'] ?? false) === true;

        $total = (int) User::query()
            ->join(
                'company_users',
                static fn ($join) => $join
                    ->on('company_users.user_id', '=', 'users.id')
                    ->where('company_users.company_id', '=', $resolvedCompanyId)
            )
            ->count();

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

        $payload = $this->readListPresenter->enrichPayload($items, $total);
        if ($countOnly) {
            $payload['count_only'] = true;
        }

        $summary = $this->formatOrganizationUsersSummary($items, $payload, $countOnly);

        return [
            'tool' => 'org.users',
            'summary' => $summary,
            'payload' => $payload,
            'sources' => ['org.users'],
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $items
     * @param  array<string, mixed>  $payload
     */
    private function formatOrganizationUsersSummary(array $items, array $payload, bool $countOnly = false): string
    {
        $total = (int) ($payload['total'] ?? count($items));
        $truncated = ($payload['truncated'] ?? false) === true;
        $remainingCount = (int) ($payload['remaining_count'] ?? 0);

        $header = $this->readListPresenter->formatListHeader(
            resourceLabel: 'user(s)',
            shownCount: count($items),
            scopeTotal: $total,
            filterLabel: null,
            truncated: $truncated,
            remainingCount: $remainingCount,
        );

        if ($countOnly || $items === []) {
            return rtrim($header, ':') . '.';
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

        $footer = $truncated ? "\nWould you like me to list all of them?" : '';

        return $header . "\n" . implode("\n", $lines) . $footer;
    }

    private function overdueTasks(User $user, int $companyId, array $args): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $role = (string) $context['role'];
        $resolvedCompanyId = (int) $context['company']->id;
        $limit = max(1, min($this->readListPresenter->maxExpandedLimit('tasks.overdue'), (int) ($args['limit'] ?? $this->readListPresenter->previewLimit())));
        $countOnly = ($args['count_only'] ?? false) === true;

        $baseQuery = Task::query()
            ->where('company_id', $resolvedCompanyId)
            ->whereNotNull('due_at')
            ->where('due_at', '<', now())
            ->whereNotIn('status', [TaskStatus::COMPLETED->value, TaskStatus::CANCELLED->value]);

        if ($role === 'agent') {
            $baseQuery->where(function (Builder $builder) use ($user): void {
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

        $total = (int) (clone $baseQuery)->count();

        $tasks = (clone $baseQuery)
            ->orderBy('due_at')
            ->limit($limit)
            ->with([
                'assignedAgent:id,name',
                'project:id,name',
            ])
            ->get();

        $currentAssigneeIdsByTask = DB::table('task_assignments')
            ->whereIn('task_id', $tasks->pluck('id'))
            ->where('is_current', true)
            ->get(['task_id', 'assigned_agent_id'])
            ->groupBy('task_id')
            ->map(static fn ($rows) => collect($rows)->pluck('assigned_agent_id')->map(static fn ($id): int => (int) $id)->all());

        $assigneeIds = $tasks
            ->flatMap(static function (Task $task) use ($currentAssigneeIdsByTask): array {
                $ids = [];
                if (is_numeric($task->assigned_agent_id) && (int) $task->assigned_agent_id > 0) {
                    $ids[] = (int) $task->assigned_agent_id;
                }

                foreach ($currentAssigneeIdsByTask->get($task->id, []) as $assigneeId) {
                    $ids[] = $assigneeId;
                }

                return $ids;
            })
            ->unique()
            ->values()
            ->all();

        $assigneeNames = $this->userDisplayNameResolver->resolveMap($assigneeIds);

        $items = $tasks
            ->map(function (Task $task) use ($assigneeNames, $currentAssigneeIdsByTask): array {
                $assigneeIdList = collect([(int) ($task->assigned_agent_id ?? 0)])
                    ->merge($currentAssigneeIdsByTask->get($task->id, []))
                    ->filter(static fn (int $id): bool => $id > 0)
                    ->unique()
                    ->values()
                    ->all();

                $assigneeNameList = $this->userDisplayNameResolver->labelsForIds($assigneeIdList, $assigneeNames);
                $primaryAssigneeName = $this->userDisplayNameResolver->label(
                    is_numeric($task->assigned_agent_id) ? (int) $task->assigned_agent_id : null,
                    $assigneeNames,
                );
                if ($primaryAssigneeName === 'Unassigned' && $assigneeNameList !== []) {
                    $primaryAssigneeName = $assigneeNameList[0];
                }

                $assigneesLabel = $assigneeNameList !== []
                    ? implode(', ', $assigneeNameList)
                    : 'Unassigned';

                return [
                    'id' => $task->id,
                    'title' => $task->title,
                    'status' => $task->status?->value,
                    'priority' => $task->priority?->value,
                    'due_at' => $task->due_at?->toIso8601String(),
                    'assigned_agent_id' => $task->assigned_agent_id,
                    'assigned_agent_name' => $primaryAssigneeName !== 'Unassigned' ? $primaryAssigneeName : null,
                    'assignee_names' => $assigneeNameList,
                    'assignees_label' => $assigneesLabel,
                    'project_id' => $task->project_id,
                    'project_name' => $task->project?->name,
                ];
            })
            ->values()
            ->all();

        $payload = $this->readListPresenter->enrichPayload($items, $total);
        if ($countOnly) {
            $payload['count_only'] = true;
        }

        return [
            'tool' => 'tasks.overdue',
            'summary' => $this->formatOverdueTasksSummary($items, $payload, $countOnly),
            'payload' => $payload,
            'sources' => ['tasks.overdue'],
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $items
     * @param  array<string, mixed>  $payload
     */
    private function formatOverdueTasksSummary(array $items, array $payload, bool $countOnly = false): string
    {
        $total = (int) ($payload['total'] ?? count($items));
        $truncated = ($payload['truncated'] ?? false) === true;
        $remainingCount = (int) ($payload['remaining_count'] ?? 0);

        $header = $this->readListPresenter->formatListHeader(
            resourceLabel: 'overdue task(s)',
            shownCount: count($items),
            scopeTotal: $total,
            filterLabel: null,
            truncated: $truncated,
            remainingCount: $remainingCount,
        );

        if ($total <= 0) {
            return 'No overdue tasks found in your permitted scope.';
        }

        if ($countOnly && count($items) > 3) {
            return rtrim($header, ':') . '.';
        }

        if ($items === []) {
            return rtrim($header, ':') . '.';
        }

        $grouped = collect($items)->groupBy(static fn (array $item): string => (string) ($item['assignees_label'] ?? 'Unassigned'));

        $lines = $grouped
            ->map(static function ($tasks, string $assignee): string {
                $titles = collect($tasks)
                    ->pluck('title')
                    ->filter(static fn (mixed $title): bool => is_string($title) && trim($title) !== '')
                    ->map(static fn (string $title): string => '"' . $title . '"')
                    ->values()
                    ->all();

                if ($titles === []) {
                    return sprintf('%s has overdue tasks with no title available.', $assignee);
                }

                if (count($titles) === 1) {
                    return sprintf('%s is assigned to the task %s.', $assignee, $titles[0]);
                }

                $lastTitle = array_pop($titles);

                return sprintf(
                    '%s is assigned to the tasks %s and %s.',
                    $assignee,
                    implode(', ', $titles),
                    $lastTitle,
                );
            })
            ->values()
            ->all();

        $footer = $truncated ? "\nWould you like me to list all of them?" : '';

        return $header . "\n" . implode("\n", $lines) . $footer;
    }

    private function projectRiskSummary(User $user, int $companyId, array $args): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $role = (string) $context['role'];
        $resolvedCompanyId = (int) $context['company']->id;
        $limit = max(1, min($this->readListPresenter->maxExpandedLimit('projects.at_risk_summary'), (int) ($args['limit'] ?? $this->readListPresenter->previewLimit())));
        $countOnly = ($args['count_only'] ?? false) === true;

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
            ->orderBy('end_date');

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

        $total = (int) (clone $projectQuery)->count();

        $items = (clone $projectQuery)
            ->limit($limit)
            ->get(['id', 'name', 'status', 'start_date', 'end_date'])
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

        $payload = $this->readListPresenter->enrichPayload($items, $total);
        if ($countOnly) {
            $payload['count_only'] = true;
        }

        $truncated = ($payload['truncated'] ?? false) === true;
        $header = $this->readListPresenter->formatListHeader(
            resourceLabel: 'at-risk project(s)',
            shownCount: count($items),
            scopeTotal: $total,
            filterLabel: null,
            truncated: $truncated,
            remainingCount: (int) ($payload['remaining_count'] ?? 0),
        );

        $summary = $total <= 0
            ? 'No project risk records were found in your active scope.'
            : rtrim($header, ':') . ($countOnly || $items === [] ? '.' : ':');

        if (! $countOnly && $items !== [] && $total > 0) {
            $summary .= "\nHere is the at-risk project snapshot from your active scope.";
            if ($truncated) {
                $summary .= "\nWould you like me to list all of them?";
            }
        }

        return [
            'tool' => 'projects.at_risk_summary',
            'summary' => $summary,
            'payload' => $payload,
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
        $limit = max(1, min($this->readListPresenter->maxExpandedLimit('meetings.today'), (int) ($args['limit'] ?? $this->readListPresenter->previewLimit())));
        $countOnly = ($args['count_only'] ?? false) === true;

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

        $total = method_exists($meetings, 'total') ? (int) $meetings->total() : count($items);
        $payload = $this->readListPresenter->enrichPayload($items, $total);
        if ($countOnly) {
            $payload['count_only'] = true;
        }

        $truncated = ($payload['truncated'] ?? false) === true;
        $header = $this->readListPresenter->formatListHeader(
            resourceLabel: 'meeting(s) today',
            shownCount: count($items),
            scopeTotal: $total,
            filterLabel: null,
            truncated: $truncated,
            remainingCount: (int) ($payload['remaining_count'] ?? 0),
        );

        $summary = $total <= 0
            ? 'No meetings are scheduled for today in your permitted scope.'
            : rtrim($header, ':') . ($countOnly ? '.' : ':');

        if (! $countOnly && $items !== [] && $total > 0) {
            $summary .= "\nThese are the meetings scheduled for today in your permitted scope.";
            if ($truncated) {
                $summary .= "\nWould you like me to list all of them?";
            }
        }

        return [
            'tool' => 'meetings.today',
            'summary' => $summary,
            'payload' => $payload,
            'sources' => ['meetings.today'],
        ];
    }

    private function activeAgents(User $user, int $companyId, array $args): array
    {
        $limit = max(1, min($this->readListPresenter->maxExpandedLimit('tracking.active_agents'), (int) ($args['limit'] ?? $this->readListPresenter->previewLimit())));
        $countOnly = ($args['count_only'] ?? false) === true;

        $active = $this->agentLocationSnapshotService->listForUser($user, [
            'company_id' => $companyId,
            'limit' => $limit,
            'include_offline' => false,
        ]);

        $items = is_array($active['items'] ?? null) ? $active['items'] : [];
        $total = is_int($active['total'] ?? null)
            ? (int) $active['total']
            : (is_int($active['count'] ?? null) ? (int) $active['count'] : count($items));

        $payload = $this->readListPresenter->enrichPayload($items, max($total, count($items)));
        if ($countOnly) {
            $payload['count_only'] = true;
        }

        $truncated = ($payload['truncated'] ?? false) === true;
        $header = $this->readListPresenter->formatListHeader(
            resourceLabel: 'active agent(s)',
            shownCount: count($items),
            scopeTotal: (int) ($payload['total'] ?? count($items)),
            filterLabel: null,
            truncated: $truncated,
            remainingCount: (int) ($payload['remaining_count'] ?? 0),
        );

        $summary = (int) ($payload['total'] ?? 0) <= 0
            ? 'No active agents are currently online in the selected scope.'
            : rtrim($header, ':') . ($countOnly ? '.' : ': Live active agent locations are available now.');

        if ($truncated && ! $countOnly) {
            $summary .= "\nWould you like me to list all of them?";
        }

        return [
            'tool' => 'tracking.active_agents',
            'summary' => $summary,
            'payload' => array_merge($active, $payload),
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

    private function driveFiles(User $user, int $companyId, array $args): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;

        $message = trim((string) ($args['message'] ?? ''));
        $limit = max(1, min(
            $this->readListPresenter->maxExpandedLimit('drive.files'),
            (int) ($args['limit'] ?? $this->readListPresenter->previewLimit()),
        ));
        $countOnly = ($args['count_only'] ?? false) === true;
        $search = $this->extractDriveSearchTerm($message);

        $result = $this->companyDriveService->listFiles(
            user: $user,
            folderId: null,
            search: $search,
            perPage: $limit,
            page: 1,
            companyId: $resolvedCompanyId,
        );

        $rawItems = is_array($result['items'] ?? null) ? $result['items'] : [];
        $total = (int) ($result['pagination']['total'] ?? count($rawItems));

        $items = array_map(fn (array $file): array => $this->mapDriveFileItem($file), $rawItems);

        $payload = $this->readListPresenter->enrichPayload($items, $total);
        if ($countOnly) {
            $payload['count_only'] = true;
        }
        if (is_string($search) && $search !== '') {
            $payload['search'] = $search;
        }

        $contentQuestion = ! $countOnly
            && $this->looksLikeFileContentQuestion($message)
            && $rawItems !== [];

        if ($contentQuestion) {
            $topFile = $rawItems[0];
            $fileId = (int) ($topFile['id'] ?? 0);
            $fileName = (string) ($topFile['original_name'] ?? '');
            $payload['file_name'] = $fileName;

            if ($fileId > 0) {
                $text = $this->driveFileContentReader->readAccessibleText($user, $fileId, $resolvedCompanyId);

                if (is_string($text) && trim($text) !== '') {
                    $payload['file_content'] = $text;
                    $payload['answered_from_file'] = true;
                } else {
                    $payload['file_content_unavailable'] = true;
                }
            }
        }

        $summary = $this->formatDriveFilesSummary($items, $payload, $search, $countOnly, $contentQuestion);

        return [
            'tool' => 'drive.files',
            'summary' => $summary,
            'payload' => $payload,
            'sources' => ['drive.files'],
        ];
    }

    /**
     * @param  array<string, mixed>  $file
     * @return array<string, mixed>
     */
    private function mapDriveFileItem(array $file): array
    {
        $folder = is_array($file['folder'] ?? null) ? $file['folder'] : null;
        $name = (string) ($file['original_name'] ?? 'file');

        return [
            'id' => (int) ($file['id'] ?? 0),
            'name' => $name,
            'folder' => $folder !== null ? (string) ($folder['name'] ?? '') : null,
            'type' => $this->driveFileTypeLabel($name, is_string($file['mime_type'] ?? null) ? (string) $file['mime_type'] : null),
            'size' => $this->formatDriveBytes((int) ($file['size_bytes'] ?? 0)),
            'source' => (string) ($file['source'] ?? 'manual'),
            'uploaded_at' => is_string($file['created_at'] ?? null) ? (string) $file['created_at'] : null,
        ];
    }

    private function driveFileTypeLabel(string $name, ?string $mimeType): string
    {
        $extension = strtolower((string) pathinfo($name, PATHINFO_EXTENSION));
        if ($extension !== '') {
            return $extension;
        }

        return is_string($mimeType) && $mimeType !== '' ? $mimeType : 'file';
    }

    private function formatDriveBytes(int $bytes): string
    {
        if ($bytes <= 0) {
            return '0 B';
        }

        $units = ['B', 'KB', 'MB', 'GB', 'TB'];
        $power = (int) min(count($units) - 1, floor(log($bytes, 1024)));
        $value = $bytes / (1024 ** $power);

        return sprintf($power === 0 ? '%d %s' : '%.1f %s', $value, $units[$power]);
    }

    private function extractDriveSearchTerm(string $message): ?string
    {
        $message = trim($message);
        if ($message === '') {
            return null;
        }

        if (preg_match('/"([^"]{2,})"|\'([^\']{2,})\'/u', $message, $matches) === 1) {
            $phrase = trim($matches[1] !== '' ? $matches[1] : (string) ($matches[2] ?? ''));
            if ($phrase !== '') {
                return $phrase;
            }
        }

        $normalized = strtolower($message);
        $normalized = preg_replace('/[^\p{L}\p{N}\s._-]/u', ' ', $normalized) ?? $normalized;

        $stopWords = [
            // question / interrogatives
            'what', 'whats', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how', 'many', 'much',
            // verbs / auxiliaries
            'is', 'are', 'am', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did', 'done',
            'have', 'has', 'had', 'will', 'shall', 'would', 'should', 'could', 'can', 'may', 'might', 'must',
            // articles / conjunctions / prepositions
            'the', 'a', 'an', 'in', 'on', 'of', 'for', 'to', 'from', 'with', 'about', 'and', 'or', 'but',
            'at', 'by', 'as', 'into', 'onto', 'over', 'under', 'out', 'up', 'down', 'off',
            // pronouns / determiners
            'my', 'our', 'your', 'their', 'his', 'her', 'its', 'me', 'i', 'we', 'us', 'you', 'they', 'them',
            'it', 'this', 'that', 'these', 'those', 'here', 'there', 'any', 'all', 'some', 'each', 'both',
            'every', 'no', 'none', 'one', 'ones', 'other', 'another', 'same', 'such',
            // command / request verbs
            'show', 'list', 'find', 'get', 'give', 'gimme', 'open', 'view', 'see', 'display', 'pull',
            'fetch', 'read', 'search', 'look', 'bring', 'load', 'retrieve', 'return', 'provide', 'present',
            // fillers / politeness
            'please', 'kindly', 'just', 'also', 'too', 'now', 'then', 'well', 'ok', 'okay', 'want', 'wanna',
            'need', 'like', 'again', 'more', 'few', 'several', 'lot', 'lots', 'available', 'currently',
            'everything', 'anything', 'something', 'them', 'stuff',
            // drive / file domain nouns (not distinguishing keywords)
            'file', 'files', 'document', 'documents', 'doc', 'docs', 'drive', 'folder', 'folders',
            'item', 'items', 'entry', 'entries', 'thing', 'things', 'attachment', 'attachments',
            'company', 'organization', 'organisation', 'org', 'team', 'shared',
            // content-question verbs (not filenames)
            'say', 'says', 'said', 'tell', 'summarize', 'summarise', 'summary', 'content', 'contents',
            'inside', 'explain', 'describe', 'according', 'regarding', 'detail', 'details', 'mention',
            'mentions', 'state', 'states', 'uploaded', 'stored', 'contain', 'contains', 'containing',
        ];

        $tokens = array_values(array_filter(
            preg_split('/\s+/', trim($normalized)) ?: [],
            static fn (string $token): bool => $token !== ''
                && mb_strlen($token) >= 2
                && preg_match('/^\d{1,3}$/', $token) !== 1
                && ! in_array($token, $stopWords, true),
        ));

        if ($tokens === []) {
            return null;
        }

        usort($tokens, static fn (string $a, string $b): int => mb_strlen($b) <=> mb_strlen($a));

        return $tokens[0];
    }

    private function looksLikeFileContentQuestion(string $message): bool
    {
        $normalized = strtolower(trim($message));
        if ($normalized === '') {
            return false;
        }

        $isBrowseIntent = preg_match('/\b(list|show|browse|how\s+many|what|which)\b[^?]*\b(files?|documents?|folders?|drive)\b/i', $normalized) === 1;
        $hasContentVerb = preg_match('/\b(summar(?:y|ize|ise)|according\s+to|contents?|inside|explain|describe|read|says?|said|state[sd]?|mention[sd]?|breakdown|detail(?:s)?)\b/i', $normalized) === 1;

        if ($isBrowseIntent && ! $hasContentVerb) {
            return false;
        }

        if ($hasContentVerb) {
            return true;
        }

        if (preg_match('/\bwhat(?:\'s| is| does| do)?\b.{0,40}\b(report|document|file|pdf|sheet|spreadsheet|doc|policy|manual|memo|proposal|contract|agreement|invoice|plan)\b/i', $normalized) === 1) {
            return true;
        }

        return preg_match('/\b(in|from)\s+the\b.{0,40}\b(report|document|file|pdf|sheet|spreadsheet|doc|policy|manual|memo|proposal|contract|agreement|invoice|plan)\b/i', $normalized) === 1;
    }

    /**
     * @param  array<int, array<string, mixed>>  $items
     * @param  array<string, mixed>  $payload
     */
    private function formatDriveFilesSummary(
        array $items,
        array $payload,
        ?string $search,
        bool $countOnly,
        bool $contentQuestion,
    ): string {
        $fileName = is_string($payload['file_name'] ?? null) ? trim((string) $payload['file_name']) : '';

        if ($contentQuestion) {
            if (($payload['answered_from_file'] ?? false) === true && $fileName !== '') {
                return sprintf('I reviewed "%s" from your drive to answer your question.', $fileName);
            }

            if (($payload['file_content_unavailable'] ?? false) === true) {
                return $fileName !== ''
                    ? sprintf('I found "%s" but could not read its contents (it may be a scanned image or an unsupported format). You can open or download it from Company Drive.', $fileName)
                    : 'I could not read the contents of that file. You can open or download it from Company Drive.';
            }

            if ($items === []) {
                return $search !== null && $search !== ''
                    ? sprintf('I could not find a drive file matching "%s" that you have access to. Please tell me the exact file name.', $search)
                    : 'I could not identify which file you mean. Please tell me the exact file name.';
            }
        }

        $total = (int) ($payload['total'] ?? count($items));
        $truncated = ($payload['truncated'] ?? false) === true;
        $remainingCount = (int) ($payload['remaining_count'] ?? 0);

        $header = $this->readListPresenter->formatListHeader(
            resourceLabel: 'file(s)',
            shownCount: count($items),
            scopeTotal: $total,
            filterLabel: $search !== '' ? $search : null,
            truncated: $truncated,
            remainingCount: $remainingCount,
        );

        if ($countOnly || $items === []) {
            return rtrim($header, ':') . '.';
        }

        $lines = collect($items)
            ->values()
            ->map(static function (array $file, int $index): string {
                $name = (string) ($file['name'] ?? 'file');
                $folder = is_string($file['folder'] ?? null) && trim((string) $file['folder']) !== ''
                    ? (string) $file['folder']
                    : null;
                $size = is_string($file['size'] ?? null) ? (string) $file['size'] : '';

                $meta = array_values(array_filter([
                    $folder !== null ? 'in ' . $folder : null,
                    $size !== '' ? $size : null,
                ], static fn (?string $part): bool => $part !== null && $part !== ''));

                return sprintf(
                    '%d. %s%s',
                    $index + 1,
                    $name,
                    $meta !== [] ? ' (' . implode(', ', $meta) . ')' : '',
                );
            })
            ->all();

        $footer = $truncated ? "\nWould you like me to list all of them?" : '';

        return $header . "\n" . implode("\n", $lines) . $footer;
    }
}
