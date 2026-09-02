<?php

declare(strict_types=1);

namespace App\Services\AI\Planning;

use App\Enums\KpiCategory;
use App\Enums\KpiPriority;
use App\Enums\KpiStatus;
use App\Enums\LeadPriority;
use App\Enums\LeadStatus;
use App\Enums\TaskPriority;
use App\Enums\TaskStatus;
use App\Enums\TaskType;
use App\Models\AgentLocationSnapshot;
use App\Models\AttendanceSetting;
use App\Models\CompanyLocation;
use App\Models\Kpi;
use App\Models\Lead;
use App\Models\Task;
use App\Models\User;
use App\Services\Attendance\AttendanceService;
use App\Services\Calendar\MeetingService;
use App\Services\Company\CompanyContextService;
use App\Services\Dashboard\DashboardAggregateService;
use App\Services\Demo\DemoCompanyService;
use App\Support\GeoDistance;
use Illuminate\Contracts\Pagination\Paginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

class DailyPlanningService
{
    private const STALE_LEAD_DAYS = 14;

    public function __construct(
        private readonly CompanyContextService $companyContextService,
        private readonly DashboardAggregateService $dashboardAggregateService,
        private readonly MeetingService $meetingService,
        private readonly AttendanceService $attendanceService,
        private readonly DemoCompanyService $demoCompanyService,
        private readonly KpiPlanDecomposer $kpiPlanDecomposer,
    ) {}

    /**
     * @param  array<string, mixed>  $args
     * @return array<string, mixed>
     */
    public function buildPlan(User $user, int $companyId, array $args = []): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $role = (string) $context['role'];
        $isDemo = $this->demoCompanyService->isDemo($resolvedCompanyId);
        $defaultLimit = (int) config('ely.daily_plan_limit', 15);
        $limit = $isDemo
            ? $this->demoPlanLimit($resolvedCompanyId, $args)
            : max(1, min(20, (int) ($args['limit'] ?? $defaultLimit)));
        $focus = in_array((string) ($args['focus'] ?? 'all'), ['all', 'visits', 'followups', 'tasks'], true)
            ? (string) ($args['focus'] ?? 'all')
            : 'all';

        [$agentLat, $agentLng, $locationAvailable] = $this->resolveAgentCoordinates(
            $user,
            $resolvedCompanyId,
            $args,
        );

        $dashboard = $this->dashboardAggregateService->overview($user, $resolvedCompanyId);
        $kpis = is_array($dashboard['kpis'] ?? null) ? $dashboard['kpis'] : [];
        $kpiGapBoost = $this->kpiGapBoost($kpis);

        $workingHours = $this->resolveWorkingHours($resolvedCompanyId);
        $attendanceState = $role === 'agent'
            ? $this->attendanceService->todayForAgent($user, $resolvedCompanyId)
            : null;

        $profileSummary = $this->buildProfileSummary($user, $resolvedCompanyId, $role, $args);

        $candidates = [];

        if (in_array($focus, ['all', 'tasks'], true)) {
            $candidates = array_merge($candidates, $this->collectTaskCandidates($user, $resolvedCompanyId, $role, $agentLat, $agentLng));
        }

        if (in_array($focus, ['all', 'followups', 'visits'], true)) {
            $candidates = array_merge($candidates, $this->collectLeadCandidates(
                $user,
                $resolvedCompanyId,
                $role,
                $agentLat,
                $agentLng,
                $kpiGapBoost,
                $focus,
            ));
        }

        if (in_array($focus, ['all', 'visits'], true)) {
            $candidates = array_merge($candidates, $this->collectNearbyLocationCandidates(
                $user,
                $resolvedCompanyId,
                $role,
                $agentLat,
                $agentLng,
                $kpiGapBoost,
            ));
        }

        if ($focus === 'all') {
            $candidates = array_merge($candidates, $this->collectMeetingCandidates($user, $resolvedCompanyId));
            $candidates = array_merge($candidates, $this->collectKpiCandidates($user, $resolvedCompanyId, $role, $workingHours));
        }

        if ($isDemo) {
            $candidates = $this->applyDemoCandidateVariety($candidates, $resolvedCompanyId);
        }

        usort($candidates, static fn(array $a, array $b): int => $b['score'] <=> $a['score']);

        $items = [];
        $rank = 1;
        foreach (array_slice($candidates, 0, $limit) as $candidate) {
            $itemId = (string) Str::uuid();
            $type = (string) ($candidate['type'] ?? '');
            $isLinkedExisting = in_array($type, ['task', 'overdue_task', 'meeting_attend'], true);

            $items[] = [
                'item_id' => $itemId,
                'parent_item_id' => $candidate['parent_item_id'] ?? null,
                'parent_entity_type' => $candidate['parent_entity_type'] ?? null,
                'parent_entity_id' => isset($candidate['parent_entity_id']) ? (int) $candidate['parent_entity_id'] : null,
                'editable' => ! $isLinkedExisting,
                'removable' => ! $isLinkedExisting,
                'rank' => $rank++,
                'type' => $type,
                'title' => $candidate['title'],
                'reason' => $candidate['reason'],
                'entity_id' => $candidate['entity_id'],
                'entity_type' => $candidate['entity_type'],
                'due_at' => $candidate['due_at'],
                'distance_km' => $candidate['distance_km'],
                'suggested_action' => $candidate['suggested_action'],
                'score' => $candidate['score'],
                'task_draft' => $this->buildTaskDraft($candidate),
            ];
        }

        $items = $this->assignTimeSlots($items, $workingHours);

        $summaryCounts = [
            'tasks' => count(array_filter($items, static fn(array $i): bool => in_array($i['type'], ['task', 'overdue_task'], true))),
            'follow_ups' => count(array_filter($items, static fn(array $i): bool => in_array($i['type'], ['follow_up', 'overdue_follow_up'], true))),
            'meetings' => count(array_filter($items, static fn(array $i): bool => in_array($i['type'], ['meeting', 'meeting_attend', 'meeting_prep'], true))),
            'nearby' => count(array_filter($items, static fn(array $i): bool => $i['type'] === 'nearby_visit')),
            'kpis' => count(array_filter($items, static fn(array $i): bool => $i['type'] === 'kpi')),
        ];

        $creatableCount = count(array_filter(
            $items,
            static fn(array $i): bool => ($i['task_draft']['creates_task'] ?? false) === true,
        ));
        $alreadyTaskCount = count(array_filter(
            $items,
            static fn(array $i): bool => in_array($i['type'], ['task', 'overdue_task'], true),
        ));

        $planDate = now()->toDateString();

        $payload = [
            'plan_date' => $planDate,
            'agent_location_available' => $locationAvailable,
            'working_hours' => $workingHours,
            'attendance' => $attendanceState,
            'kpi_snapshot' => [
                'completed_tasks' => (int) ($kpis['completed_tasks'] ?? 0),
                'total_tasks' => (int) ($kpis['total_tasks'] ?? 0),
                'total_leads' => (int) ($kpis['total_leads'] ?? 0),
                'converted_leads' => (int) ($kpis['converted_leads'] ?? 0),
            ],
            'items' => $items,
            'profile_summary' => $profileSummary,
            'summary_counts' => $summaryCounts,
            'focus' => $focus,
            'acceptance' => [
                'plan_date' => $planDate,
                'item_count' => count($items),
                'creatable_count' => $creatableCount,
                'already_task_count' => $alreadyTaskCount,
            ],
        ];

        return [
            'tool' => 'planning.daily',
            'summary' => $this->buildSummary($items, $summaryCounts, $kpiGapBoost > 0),
            'payload' => $payload,
            'sources' => ['planning.daily'],
        ];
    }

    /**
     * @param  array<string, mixed>  $args
     * @return array{0: ?float, 1: ?float, 2: bool}
     */
    private function resolveAgentCoordinates(User $user, int $companyId, array $args): array
    {
        $lat = isset($args['latitude']) ? (float) $args['latitude'] : null;
        $lng = isset($args['longitude']) ? (float) $args['longitude'] : null;

        if (GeoDistance::isValidCoordinate($lat, $lng)) {
            return [$lat, $lng, true];
        }

        $snapshot = AgentLocationSnapshot::query()
            ->where('company_id', $companyId)
            ->where('user_id', $user->id)
            ->orderByDesc('last_seen_at')
            ->first();

        if ($snapshot !== null && GeoDistance::isValidCoordinate($snapshot->latitude, $snapshot->longitude)) {
            return [$snapshot->latitude, $snapshot->longitude, true];
        }

        return [null, null, false];
    }

    /**
     * @param  array<string, int>  $kpis
     */
    private function kpiGapBoost(array $kpis): float
    {
        $total = max(1, (int) ($kpis['total_tasks'] ?? 0));
        $completed = (int) ($kpis['completed_tasks'] ?? 0);
        $ratio = $completed / $total;

        return $ratio < 0.5 ? 15.0 : ($ratio < 0.7 ? 8.0 : 0.0);
    }

    /**
     * @return array{open: ?string, close: ?string, working_days: array<int, string>|null}
     */
    private function resolveWorkingHours(int $companyId): array
    {
        $settings = AttendanceSetting::query()->where('company_id', $companyId)->first();

        if ($settings === null) {
            return ['open' => null, 'close' => null, 'working_days' => null];
        }

        return [
            'open' => $settings->opening_time !== null ? substr((string) $settings->opening_time, 0, 5) : null,
            'close' => $settings->closing_time !== null ? substr((string) $settings->closing_time, 0, 5) : null,
            'working_days' => is_array($settings->working_days) ? $settings->working_days : null,
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function collectTaskCandidates(
        User $user,
        int $companyId,
        string $role,
        ?float $agentLat,
        ?float $agentLng,
    ): array {
        $now = now();
        $endOfDay = now()->endOfDay();

        $query = Task::query()
            ->where('company_id', $companyId)
            ->whereNotIn('status', [TaskStatus::COMPLETED->value, TaskStatus::CANCELLED->value])
            ->where(function (Builder $builder) use ($now, $endOfDay): void {
                $builder->where(function (Builder $overdue) use ($now): void {
                    $overdue->whereNotNull('due_at')->where('due_at', '<', $now);
                })->orWhere(function (Builder $dueToday) use ($now, $endOfDay): void {
                    $dueToday->whereNotNull('due_at')
                        ->whereBetween('due_at', [$now->copy()->startOfDay(), $endOfDay]);
                })->orWhere(function (Builder $dueThisWeek) use ($now, $endOfDay): void {
                    $dueThisWeek->where('status', TaskStatus::IN_PROGRESS->value)
                        ->whereNotNull('due_at')
                        ->where('due_at', '>', $endOfDay)
                        ->where('due_at', '<=', $now->copy()->endOfWeek());
                });
            })
            ->orderBy('due_at')
            ->limit(20);

        if ($role === 'agent') {
            $this->applyAgentTaskScope($query, $user->id);
        }

        $candidates = [];
        foreach ($query->get() as $task) {
            $isOverdue = $task->due_at !== null && $task->due_at->isPast();
            $isDueToday = $task->due_at !== null
                && ! $isOverdue
                && $task->due_at->between($now->copy()->startOfDay(), $endOfDay);
            $isWeekTask = ! $isOverdue && ! $isDueToday;
            $distanceKm = $this->distanceForTask($task, $agentLat, $agentLng);
            $priorityBonus = $this->taskPriorityBonus($task->priority);

            $score = match (true) {
                $isOverdue => 86.0 + $priorityBonus,
                $isDueToday => 55.0 + $priorityBonus,
                default => 32.0 + ($priorityBonus * 0.5),
            };
            if ($distanceKm !== null) {
                $score -= min(20.0, $distanceKm * 0.5);
            }

            $candidates[] = [
                'type' => $isOverdue ? 'overdue_task' : 'task',
                'title' => (string) $task->title,
                'reason' => match (true) {
                    $isOverdue => 'Overdue task requiring immediate attention',
                    $isDueToday => 'Due today',
                    default => 'In progress — due this week',
                },
                'entity_id' => $task->id,
                'entity_type' => 'task',
                'due_at' => $task->due_at?->toIso8601String(),
                'distance_km' => $distanceKm,
                'suggested_action' => $isOverdue ? 'Complete or reschedule this task' : 'Work on this task today',
                'score' => $score,
                'task_id' => (int) $task->id,
                'task_type' => $task->type?->value,
                'task_description' => (string) ($task->description ?? ''),
                'task_priority' => $task->priority?->value ?? 'medium',
                'location_text' => $task->location_text,
                'latitude' => $task->latitude !== null ? (float) $task->latitude : null,
                'longitude' => $task->longitude !== null ? (float) $task->longitude : null,
            ];
        }

        return $candidates;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function collectLeadCandidates(
        User $user,
        int $companyId,
        string $role,
        ?float $agentLat,
        ?float $agentLng,
        float $kpiGapBoost,
        string $focus,
    ): array {
        $query = Lead::query()
            ->where('company_id', $companyId)
            ->whereNull('converted_at')
            ->whereNotIn('status', [LeadStatus::WON->value, LeadStatus::LOST->value])
            ->with('companyLocation:id,latitude,longitude,name')
            ->limit(25);

        if ($role === 'agent') {
            $this->applyAgentLeadScope($query, (int) $user->id);
        }

        $candidates = [];
        $staleThreshold = now()->subDays(self::STALE_LEAD_DAYS);

        foreach ($query->get() as $lead) {
            $lastContact = $lead->last_interaction_at;
            $isStale = $lastContact === null || $lastContact->lt($staleThreshold);
            $daysSince = $lastContact !== null
                ? (int) $lastContact->diffInDays(now())
                : self::STALE_LEAD_DAYS + 1;
            $nextActionDue = $this->leadNextActionOverdue($lead);
            $isOverdueFollowUp = $isStale || $nextActionDue;

            if ($focus === 'followups' && ! $isStale && trim((string) $lead->next_action) === '') {
                continue;
            }

            if ($focus === 'visits' && ! $isStale) {
                continue;
            }

            $distanceKm = $this->distanceForLead($lead, $agentLat, $agentLng);
            $priorityBonus = $this->leadPriorityBonus($lead->priority);
            $stalenessBonus = min(25.0, $daysSince * 1.2);

            $score = 40.0 + $priorityBonus + $stalenessBonus + $kpiGapBoost;
            if ($isStale) {
                $score += 10.0;
            }
            if ($distanceKm !== null) {
                $score += max(0.0, 15.0 - min(15.0, $distanceKm * 0.8));
            }

            $reason = match (true) {
                $nextActionDue => 'Follow-up action is overdue',
                $isStale => sprintf('No contact in %d days%s', $daysSince, $this->priorityLabel($lead->priority)),
                default => 'Follow-up action pending',
            };

            $location = $lead->companyLocation;

            $candidates[] = [
                'type' => $isOverdueFollowUp ? 'overdue_follow_up' : 'follow_up',
                'title' => 'Follow up: ' . $lead->name,
                'reason' => $reason,
                'entity_id' => $lead->id,
                'entity_type' => 'lead',
                'due_at' => null,
                'distance_km' => $distanceKm,
                'suggested_action' => trim((string) $lead->next_action) !== ''
                    ? (string) $lead->next_action
                    : ($distanceKm !== null && $distanceKm < 5 ? 'Visit while nearby' : 'Call or email to re-engage'),
                'score' => $score,
                'lead_name' => (string) $lead->name,
                'location_text' => $location?->name,
                'latitude' => $location?->latitude !== null ? (float) $location->latitude : null,
                'longitude' => $location?->longitude !== null ? (float) $location->longitude : null,
            ];
        }

        return $candidates;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function collectNearbyLocationCandidates(
        User $user,
        int $companyId,
        string $role,
        ?float $agentLat,
        ?float $agentLng,
        float $kpiGapBoost,
    ): array {
        if (! GeoDistance::isValidCoordinate($agentLat, $agentLng)) {
            return [];
        }

        $locations = CompanyLocation::query()
            ->where('company_id', $companyId)
            ->where('is_active', true)
            ->whereNotNull('latitude')
            ->whereNotNull('longitude')
            ->with('crmLead:id,name,company_location_id,last_interaction_at,status')
            ->limit(30)
            ->get();

        $candidates = [];
        foreach ($locations as $location) {
            $distanceKm = GeoDistance::haversineKm(
                $agentLat,
                $agentLng,
                (float) $location->latitude,
                (float) $location->longitude,
            );

            if ($distanceKm > 15.0) {
                continue;
            }

            $lead = $location->crmLead;
            if ($lead !== null) {
                if ($role === 'agent' && ! $this->agentCanAccessLead($lead, (int) $user->id)) {
                    continue;
                }
                if (in_array((string) $lead->status, [LeadStatus::WON->value, LeadStatus::LOST->value], true)) {
                    continue;
                }
            }

            $score = 35.0 + $kpiGapBoost + max(0.0, 20.0 - $distanceKm);
            $title = $lead !== null
                ? 'Nearby: ' . $lead->name
                : 'Nearby: ' . $location->name;

            $candidates[] = [
                'type' => 'nearby_visit',
                'title' => $title,
                'reason' => sprintf('%.1f km away — good opportunity while in the area', $distanceKm),
                'entity_id' => $lead?->id ?? $location->id,
                'entity_type' => $lead !== null ? 'lead' : 'company_location',
                'due_at' => null,
                'distance_km' => $distanceKm,
                'suggested_action' => 'Stop by for a visit or discovery conversation',
                'score' => $score,
                'location_text' => (string) $location->name,
                'latitude' => (float) $location->latitude,
                'longitude' => (float) $location->longitude,
            ];
        }

        return $candidates;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function collectMeetingCandidates(User $user, int $companyId): array
    {
        /** @var Paginator $meetings */
        $meetings = $this->meetingService->listForUser($user, [
            'company_id' => $companyId,
            'from' => now()->startOfDay()->toDateTimeString(),
            'to' => now()->endOfDay()->toDateTimeString(),
            'per_page' => 10,
        ]);

        $candidates = [];
        foreach (collect($meetings->items()) as $meeting) {
            $startAt = $meeting->start_at instanceof Carbon
                ? $meeting->start_at
                : ($meeting->start_at !== null ? Carbon::parse($meeting->start_at) : null);

            $meetingTitle = (string) $meeting->title;
            $meetingId = (int) $meeting->id;
            $baseScore = 70.0;
            if ($startAt !== null && $startAt->isPast()) {
                $baseScore = 45.0;
            } elseif ($startAt !== null && $startAt->diffInMinutes(now()) <= 60) {
                $baseScore = 90.0;
            }

            $candidates[] = [
                'type' => 'meeting_attend',
                'title' => 'Attend: ' . $meetingTitle,
                'reason' => $startAt !== null
                    ? 'Scheduled for ' . $startAt->format('H:i')
                    : 'Meeting scheduled today',
                'entity_id' => $meetingId,
                'entity_type' => 'meeting',
                'due_at' => $startAt?->toIso8601String(),
                'distance_km' => null,
                'suggested_action' => 'Attend on time and capture outcomes',
                'score' => $baseScore + 2.0,
                'meeting_start_at' => $startAt?->toIso8601String(),
                'location_text' => $meeting->location,
            ];

            $prepScore = $baseScore - 5.0;
            if ($startAt !== null && $startAt->diffInMinutes(now()) <= 90) {
                $prepScore += 8.0;
            }

            $candidates[] = [
                'type' => 'meeting_prep',
                'title' => 'Prepare for: ' . $meetingTitle,
                'reason' => $startAt !== null
                    ? 'Prep 30 min before ' . $startAt->format('H:i')
                    : 'Prepare before your meeting',
                'entity_id' => $meetingId,
                'entity_type' => 'meeting',
                'due_at' => $startAt?->copy()->subMinutes(30)->toIso8601String(),
                'distance_km' => null,
                'suggested_action' => 'Prepare talking points and materials',
                'score' => $prepScore,
                'meeting_start_at' => $startAt?->toIso8601String(),
                'location_text' => $meeting->location,
            ];
        }

        return $candidates;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function collectKpiCandidates(User $user, int $companyId, string $role, array $workingHours): array
    {
        $query = Kpi::query()
            ->where('company_id', $companyId)
            ->whereIn('status', [KpiStatus::PENDING->value, KpiStatus::IN_PROGRESS->value])
            ->where(function (Builder $builder): void {
                $builder->whereNull('end_date')
                    ->orWhere('end_date', '>=', now()->toDateString());
            })
            ->orderByDesc('priority')
            ->limit(10);

        if ($role === 'agent') {
            $query->where('assigned_to_user_id', $user->id);
        }

        $candidates = [];
        $workingDays = $workingHours['working_days'] ?? null;

        foreach ($query->get() as $kpi) {
            $daysRemaining = $kpi->end_date !== null
                ? max(0, (int) now()->startOfDay()->diffInDays($kpi->end_date, false))
                : 30;
            $priorityBonus = $this->kpiRecordPriorityBonus($kpi->priority);
            $urgencyBonus = $daysRemaining <= 3 ? 20.0 : ($daysRemaining <= 7 ? 12.0 : 5.0);
            $baseScore = 50.0 + $priorityBonus + $urgencyBonus;

            $chunks = $this->kpiPlanDecomposer->decomposeForToday($kpi, $baseScore, $workingDays);
            if ($chunks !== []) {
                $candidates = array_merge($candidates, $chunks);

                continue;
            }

            $candidates[] = [
                'type' => 'kpi',
                'title' => 'KPI: ' . $kpi->name,
                'reason' => $daysRemaining <= 7
                    ? sprintf('KPI due in %d day%s — needs progress', $daysRemaining, $daysRemaining === 1 ? '' : 's')
                    : 'Active KPI assigned to you',
                'entity_id' => (int) $kpi->id,
                'entity_type' => 'kpi',
                'due_at' => $kpi->end_date?->endOfDay()->toIso8601String(),
                'distance_km' => null,
                'suggested_action' => trim((string) $kpi->objective) !== ''
                    ? (string) $kpi->objective
                    : 'Take action to advance this KPI target',
                'score' => $baseScore,
                'kpi_name' => (string) $kpi->name,
                'kpi_category' => $kpi->category?->value,
                'kpi_objective' => (string) ($kpi->objective ?? ''),
                'kpi_priority' => $kpi->priority?->value ?? 'medium',
                'kpi_end_date' => $kpi->end_date?->toDateString(),
            ];
        }

        return $candidates;
    }

    /**
     * @param  array<string, mixed>  $candidate
     * @return array<string, mixed>
     */
    private function buildTaskDraft(array $candidate): array
    {
        $type = (string) ($candidate['type'] ?? '');
        $entityId = (int) ($candidate['entity_id'] ?? 0);
        $entityType = (string) ($candidate['entity_type'] ?? '');
        $dedupeKey = hash('sha256', $entityType . ':' . $entityId . ':' . now()->toDateString());

        if (in_array($type, ['task', 'overdue_task'], true)) {
            return [
                'creates_task' => false,
                'linked_task_id' => (int) ($candidate['task_id'] ?? $entityId),
                'dedupe_key' => $dedupeKey,
                'title' => (string) $candidate['title'],
                'type' => $candidate['task_type'] ?? null,
                'description' => (string) ($candidate['task_description'] ?? 'Existing task in your plan.'),
                'due_date' => $candidate['due_at'],
                'priority' => $candidate['task_priority'] ?? 'medium',
                'location' => $this->nullableLocation($candidate['location_text'] ?? null),
                'latitude' => $candidate['latitude'] ?? null,
                'longitude' => $candidate['longitude'] ?? null,
            ];
        }

        $endOfDay = now()->endOfDay()->toIso8601String();

        if ($type === 'follow_up' || $type === 'overdue_follow_up') {
            $leadName = (string) ($candidate['lead_name'] ?? 'lead');
            $action = (string) ($candidate['suggested_action'] ?? 'Follow up with this lead.');

            return [
                'creates_task' => true,
                'linked_task_id' => null,
                'dedupe_key' => $dedupeKey,
                'title' => 'Follow up: ' . $leadName,
                'type' => TaskType::SALES_VISIT->value,
                'description' => 'Planned follow-up for ' . $leadName . '. ' . $action . ' [plan:' . $dedupeKey . ']',
                'due_date' => $endOfDay,
                'priority' => 'medium',
                'location' => $this->nullableLocation($candidate['location_text'] ?? null),
                'latitude' => $candidate['latitude'] ?? null,
                'longitude' => $candidate['longitude'] ?? null,
            ];
        }

        if ($type === 'meeting_attend') {
            $meetingTitle = (string) ($candidate['title'] ?? 'meeting');
            $dueDate = $candidate['meeting_start_at'] ?? $candidate['due_at'] ?? $endOfDay;

            return [
                'creates_task' => false,
                'linked_task_id' => null,
                'dedupe_key' => $dedupeKey,
                'title' => str_starts_with($meetingTitle, 'Attend: ') ? $meetingTitle : 'Attend: ' . $meetingTitle,
                'type' => TaskType::AWARENESS->value,
                'description' => 'Scheduled meeting on your plan for today.',
                'due_date' => $dueDate,
                'priority' => 'high',
                'location' => $this->nullableLocation($candidate['location_text'] ?? null),
                'latitude' => null,
                'longitude' => null,
            ];
        }

        if ($type === 'meeting_prep' || $type === 'meeting') {
            $meetingTitle = (string) ($candidate['title'] ?? 'meeting');
            $dueDate = $candidate['meeting_start_at'] ?? $candidate['due_at'] ?? $endOfDay;
            if (is_string($dueDate)) {
                $dueDate = Carbon::parse($dueDate)->subMinutes(30)->toIso8601String();
            }

            return [
                'creates_task' => true,
                'linked_task_id' => null,
                'dedupe_key' => $dedupeKey,
                'title' => 'Prepare for: ' . $meetingTitle,
                'type' => TaskType::AWARENESS->value,
                'description' => 'Prepare talking points and materials for: ' . $meetingTitle . '. [plan:' . $dedupeKey . ']',
                'due_date' => $dueDate,
                'priority' => 'high',
                'location' => $this->nullableLocation($candidate['location_text'] ?? null),
                'latitude' => null,
                'longitude' => null,
            ];
        }

        if ($type === 'nearby_visit') {
            return [
                'creates_task' => true,
                'linked_task_id' => null,
                'dedupe_key' => $dedupeKey,
                'title' => (string) ($candidate['title'] ?? 'Nearby visit'),
                'type' => TaskType::SALES_VISIT->value,
                'description' => 'Planned nearby visit opportunity. ' . (string) ($candidate['suggested_action'] ?? '') . ' [plan:' . $dedupeKey . ']',
                'due_date' => $endOfDay,
                'priority' => 'medium',
                'location' => $this->nullableLocation($candidate['location_text'] ?? null),
                'latitude' => $candidate['latitude'] ?? null,
                'longitude' => $candidate['longitude'] ?? null,
            ];
        }

        if ($type === 'kpi') {
            $kpiName = (string) ($candidate['kpi_name'] ?? 'KPI');
            $objective = trim((string) ($candidate['kpi_objective'] ?? ''));
            $dedupeKey = (string) ($candidate['kpi_dedupe_key'] ?? $dedupeKey);
            $chunkAmount = (int) ($candidate['kpi_chunk_amount'] ?? 0);
            $chunkIndex = (int) ($candidate['kpi_chunk_index'] ?? 0);
            $chunkTotal = (int) ($candidate['kpi_chunk_total'] ?? 0);
            $title = (string) ($candidate['title'] ?? ('Work on KPI: ' . $kpiName));
            $dueDate = now()->endOfDay()->toIso8601String();

            $chunkNote = $chunkAmount > 0
                ? sprintf(' Today\'s target: %d (%d/%d).', $chunkAmount, $chunkIndex, $chunkTotal)
                : '';

            return [
                'creates_task' => true,
                'linked_task_id' => null,
                'dedupe_key' => $dedupeKey,
                'title' => $title,
                'type' => $this->kpiPlanDecomposer->taskTypeForCategory($candidate['kpi_category'] ?? null),
                'description' => ($objective !== '' ? $objective : 'Advance progress on KPI: ' . $kpiName)
                    . $chunkNote
                    . ' [plan:' . $dedupeKey . ']',
                'due_date' => $dueDate,
                'priority' => $this->kpiPlanDecomposer->taskPriorityForKpi($candidate['kpi_priority'] ?? 'medium'),
                'location' => null,
                'latitude' => null,
                'longitude' => null,
            ];
        }

        return [
            'creates_task' => false,
            'linked_task_id' => null,
            'dedupe_key' => $dedupeKey,
            'title' => (string) ($candidate['title'] ?? 'Plan item'),
            'type' => null,
            'description' => '',
            'due_date' => $endOfDay,
            'priority' => 'medium',
            'location' => null,
            'latitude' => null,
            'longitude' => null,
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $items
     * @param  array{open: ?string, close: ?string, working_days: array<int, string>|null}  $workingHours
     * @return array<int, array<string, mixed>>
     */
    private function assignTimeSlots(array $items, array $workingHours): array
    {
        if ($items === []) {
            return $items;
        }

        $open = $workingHours['open'] ?? '09:00';
        $close = $workingHours['close'] ?? '17:00';
        $dayStart = now()->copy()->setTimeFromTimeString($open . ':00');
        $dayEnd = now()->copy()->setTimeFromTimeString($close . ':00');

        if ($dayEnd->lte($dayStart)) {
            $dayEnd = $dayStart->copy()->addHours(8);
        }

        $totalMinutes = max(30, (int) $dayStart->diffInMinutes($dayEnd));
        $blockMinutes = max(30, (int) floor($totalMinutes / count($items)));
        $cursor = $dayStart->copy();

        foreach ($items as $index => &$item) {
            if (in_array($item['type'], ['meeting', 'meeting_attend'], true) && is_string($item['due_at'] ?? null)) {
                $meetingStart = Carbon::parse($item['due_at']);
                if ($item['type'] === 'meeting_attend') {
                    $item['scheduled_start'] = $meetingStart->format('H:i');
                    $item['scheduled_end'] = $meetingStart->copy()->addMinutes(30)->format('H:i');
                } else {
                    $slotStart = $meetingStart->copy()->subMinutes(30);
                    if ($slotStart->lt($dayStart)) {
                        $slotStart = $dayStart->copy();
                    }
                    $item['scheduled_start'] = $slotStart->format('H:i');
                    $item['scheduled_end'] = $meetingStart->format('H:i');
                }
                if ($meetingStart->gt($cursor)) {
                    $cursor = $meetingStart->copy();
                }
            } elseif ($item['type'] === 'meeting_prep' && is_string($item['due_at'] ?? null)) {
                $prepStart = Carbon::parse($item['due_at']);
                $slotEnd = $prepStart->copy()->addMinutes(30);
                if ($prepStart->lt($dayStart)) {
                    $prepStart = $dayStart->copy();
                }
                $item['scheduled_start'] = $prepStart->format('H:i');
                $item['scheduled_end'] = $slotEnd->format('H:i');
                if ($slotEnd->gt($cursor)) {
                    $cursor = $slotEnd->copy();
                }
            } else {
                $slotStart = $cursor->copy();
                $slotEnd = $cursor->copy()->addMinutes($blockMinutes);
                if ($slotEnd->gt($dayEnd)) {
                    $slotEnd = $dayEnd->copy();
                }
                $item['scheduled_start'] = $slotStart->format('H:i');
                $item['scheduled_end'] = $slotEnd->format('H:i');
                $cursor = $slotEnd->copy();
            }
        }
        unset($item);

        return $items;
    }

    /**
     * @param  array<string, mixed>  $args
     * @return array<string, int>
     */
    private function buildProfileSummary(User $user, int $companyId, string $role, array $args): array
    {
        $now = now();
        $endOfDay = $now->copy()->endOfDay();
        $staleThreshold = $now->copy()->subDays(self::STALE_LEAD_DAYS);

        $taskQuery = Task::query()
            ->where('company_id', $companyId)
            ->whereNotIn('status', [TaskStatus::COMPLETED->value, TaskStatus::CANCELLED->value]);

        if ($role === 'agent') {
            $this->applyAgentTaskScope($taskQuery, $user->id);
        }

        $overdueTasks = (clone $taskQuery)
            ->whereNotNull('due_at')
            ->where('due_at', '<', $now)
            ->count();

        $tasksDueToday = (clone $taskQuery)
            ->whereNotNull('due_at')
            ->whereBetween('due_at', [$now->copy()->startOfDay(), $endOfDay])
            ->count();

        $leadQuery = Lead::query()
            ->where('company_id', $companyId)
            ->whereNull('converted_at')
            ->whereNotIn('status', [LeadStatus::WON->value, LeadStatus::LOST->value]);

        if ($role === 'agent') {
            $this->applyAgentLeadScope($leadQuery, (int) $user->id);
        }

        $staleLeads = (clone $leadQuery)
            ->where(function (Builder $builder) use ($staleThreshold): void {
                $builder->whereNull('last_interaction_at')
                    ->orWhere('last_interaction_at', '<', $staleThreshold);
            })
            ->count();

        $kpiQuery = Kpi::query()
            ->where('company_id', $companyId)
            ->whereIn('status', [KpiStatus::PENDING->value, KpiStatus::IN_PROGRESS->value])
            ->where(function (Builder $builder): void {
                $builder->whereNull('end_date')
                    ->orWhere('end_date', '>=', now()->toDateString());
            });

        if ($role === 'agent') {
            $kpiQuery->where('assigned_to_user_id', $user->id);
        }

        $activeKpis = $kpiQuery->count();

        /** @var Paginator $meetings */
        $meetings = $this->meetingService->listForUser($user, [
            'company_id' => $companyId,
            'from' => $now->copy()->startOfDay()->toDateTimeString(),
            'to' => $endOfDay->toDateTimeString(),
            'per_page' => 20,
        ]);

        $nearbyOpportunities = 0;
        $agentLat = isset($args['latitude']) ? (float) $args['latitude'] : null;
        $agentLng = isset($args['longitude']) ? (float) $args['longitude'] : null;
        if (GeoDistance::isValidCoordinate($agentLat, $agentLng)) {
            $nearbyOpportunities = count($this->collectNearbyLocationCandidates(
                $user,
                $companyId,
                $role,
                $agentLat,
                $agentLng,
                0.0,
            ));
        }

        return [
            'tasks_due' => $tasksDueToday,
            'overdue_tasks' => $overdueTasks,
            'meetings_today' => count(collect($meetings->items())),
            'active_kpis' => $activeKpis,
            'stale_leads' => $staleLeads,
            'nearby_opportunities' => $nearbyOpportunities,
        ];
    }

    private function leadNextActionOverdue(Lead $lead): bool
    {
        $nextAction = trim((string) $lead->next_action);
        if ($nextAction === '') {
            return false;
        }

        if (! isset($lead->next_action_due_at)) {
            return false;
        }

        $dueField = $lead->next_action_due_at;
        if ($dueField instanceof Carbon) {
            return $dueField->isPast();
        }

        if (is_string($dueField) && $dueField !== '') {
            return Carbon::parse($dueField)->isPast();
        }

        return false;
    }

    private function kpiCategoryToTaskType(?string $category): string
    {
        return match ($category) {
            KpiCategory::COLLECTION->value => TaskType::COLLECTION->value,
            KpiCategory::SURVEY->value, KpiCategory::MERCHANDISING->value => TaskType::AWARENESS->value,
            default => TaskType::SALES_VISIT->value,
        };
    }

    private function kpiPriorityToTaskPriority(string $priority): string
    {
        return match ($priority) {
            KpiPriority::CRITICAL->value, KpiPriority::HIGH->value => 'high',
            KpiPriority::LOW->value => 'low',
            default => 'medium',
        };
    }

    private function kpiRecordPriorityBonus(?KpiPriority $priority): float
    {
        return match ($priority) {
            KpiPriority::CRITICAL => 25.0,
            KpiPriority::HIGH => 18.0,
            KpiPriority::MEDIUM => 10.0,
            KpiPriority::LOW => 4.0,
            default => 0.0,
        };
    }

    private function applyAgentTaskScope(Builder $query, int $userId): void
    {
        $query->where(function (Builder $builder) use ($userId): void {
            $builder->where('assigned_agent_id', $userId)
                ->orWhereExists(function ($sub) use ($userId): void {
                    $sub->selectRaw('1')
                        ->from('task_assignments')
                        ->whereColumn('task_assignments.task_id', 'tasks.id')
                        ->where('task_assignments.assigned_agent_id', $userId)
                        ->where('task_assignments.is_current', true);
                });
        });
    }

    private function applyAgentLeadScope(Builder $query, int $userId): void
    {
        $query->where(function (Builder $builder) use ($userId): void {
            $builder->where('created_by_user_id', $userId)
                ->orWhere('assigned_to_user_id', $userId);
        });
    }

    private function agentCanAccessLead(Lead $lead, int $userId): bool
    {
        return (int) $lead->created_by_user_id === $userId
            || (int) ($lead->assigned_to_user_id ?? 0) === $userId;
    }

    private function distanceForTask(Task $task, ?float $agentLat, ?float $agentLng): ?float
    {
        if (! GeoDistance::isValidCoordinate($agentLat, $agentLng)) {
            return null;
        }
        if (! GeoDistance::isValidCoordinate($task->latitude, $task->longitude)) {
            return null;
        }

        return GeoDistance::haversineKm($agentLat, $agentLng, (float) $task->latitude, (float) $task->longitude);
    }

    private function distanceForLead(Lead $lead, ?float $agentLat, ?float $agentLng): ?float
    {
        if (! GeoDistance::isValidCoordinate($agentLat, $agentLng)) {
            return null;
        }

        $location = $lead->companyLocation;
        if ($location === null || ! GeoDistance::isValidCoordinate($location->latitude, $location->longitude)) {
            return null;
        }

        return GeoDistance::haversineKm(
            $agentLat,
            $agentLng,
            (float) $location->latitude,
            (float) $location->longitude,
        );
    }

    private function taskPriorityBonus(?TaskPriority $priority): float
    {
        return match ($priority) {
            TaskPriority::HIGH => 15.0,
            TaskPriority::MEDIUM => 8.0,
            TaskPriority::LOW => 3.0,
            default => 0.0,
        };
    }

    private function leadPriorityBonus(?LeadPriority $priority): float
    {
        return match ($priority) {
            LeadPriority::URGENT => 20.0,
            LeadPriority::HIGH => 15.0,
            LeadPriority::MEDIUM => 8.0,
            LeadPriority::LOW => 3.0,
            default => 0.0,
        };
    }

    private function priorityLabel(?LeadPriority $priority): string
    {
        if ($priority === LeadPriority::HIGH || $priority === LeadPriority::URGENT) {
            return '; high priority lead';
        }

        return '';
    }

    /**
     * @param  array<int, array<string, mixed>>  $items
     * @param  array<string, int>  $summaryCounts
     */
    private function buildSummary(array $items, array $summaryCounts, bool $kpiGap): string
    {
        if ($items === []) {
            return 'Your day looks clear — no urgent tasks, follow-ups, or meetings require immediate attention. '
                . ($kpiGap ? 'Consider proactive outreach to improve your KPI progress.' : 'Stay ready for new assignments.');
        }

        $parts = [];
        if ($summaryCounts['tasks'] > 0) {
            $parts[] = $summaryCounts['tasks'] . ' task' . ($summaryCounts['tasks'] > 1 ? 's' : '') . ' need attention';
        }
        if ($summaryCounts['follow_ups'] > 0) {
            $parts[] = $summaryCounts['follow_ups'] . ' follow-up' . ($summaryCounts['follow_ups'] > 1 ? 's' : '');
        }
        if ($summaryCounts['meetings'] > 0) {
            $parts[] = $summaryCounts['meetings'] . ' meeting' . ($summaryCounts['meetings'] > 1 ? 's' : '') . ' today';
        }
        if ($summaryCounts['nearby'] > 0) {
            $parts[] = $summaryCounts['nearby'] . ' nearby opportunit' . ($summaryCounts['nearby'] > 1 ? 'ies' : 'y');
        }
        if (($summaryCounts['kpis'] ?? 0) > 0) {
            $kpiCount = (int) $summaryCounts['kpis'];
            $parts[] = $kpiCount . ' KPI' . ($kpiCount > 1 ? 's' : '') . ' to advance';
        }

        $top = $items[0];
        $topDetail = $top['title'];
        if ($top['distance_km'] !== null) {
            $topDetail .= sprintf(' (%.1f km away)', $top['distance_km']);
        }

        $segmentNote = count($items) . ' time block' . (count($items) > 1 ? 's' : '') . ' scheduled across your day.';
        $intro = 'Here is your prioritized plan for today: ' . implode(', ', $parts) . '. ' . $segmentNote;
        $start = 'Start with ' . $topDetail . ' — ' . strtolower((string) $top['reason']) . '.';

        return $intro . ' ' . $start;
    }

    /**
     * @param  array<string, mixed>  $args
     */
    private function nullableLocation(mixed $location): ?string
    {
        if (! is_string($location)) {
            return null;
        }

        $trimmed = trim($location);

        return $trimmed !== '' ? $trimmed : null;
    }

    private function demoPlanLimit(int $companyId, array $args): int
    {
        if (isset($args['limit'])) {
            return max(1, min(20, (int) $args['limit']));
        }

        $seed = crc32($companyId . ':' . now()->toDateString());

        return 5 + ($seed % 4);
    }

    /**
     * @param  array<int, array<string, mixed>>  $candidates
     * @return array<int, array<string, mixed>>
     */
    private function applyDemoCandidateVariety(array $candidates, int $companyId): array
    {
        $seed = crc32($companyId . ':' . now()->toDateString());

        foreach ($candidates as &$candidate) {
            $entityKey = (string) ($candidate['entity_id'] ?? $candidate['title'] ?? '');
            $jitter = (crc32($seed . ':' . $entityKey) % 20) / 100.0;
            $candidate['score'] = (float) ($candidate['score'] ?? 0) + $jitter;
        }
        unset($candidate);

        return $candidates;
    }
}
