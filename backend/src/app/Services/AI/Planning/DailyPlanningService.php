<?php

declare(strict_types=1);

namespace App\Services\AI\Planning;

use App\Enums\LeadPriority;
use App\Enums\LeadStatus;
use App\Enums\TaskPriority;
use App\Enums\TaskStatus;
use App\Models\AgentLocationSnapshot;
use App\Models\AttendanceSetting;
use App\Models\CompanyLocation;
use App\Models\Lead;
use App\Models\Task;
use App\Models\User;
use App\Services\Attendance\AttendanceService;
use App\Services\Calendar\MeetingService;
use App\Services\Company\CompanyContextService;
use App\Services\Dashboard\DashboardAggregateService;
use App\Support\GeoDistance;
use Illuminate\Contracts\Pagination\Paginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;

class DailyPlanningService
{
    private const STALE_LEAD_DAYS = 14;

    public function __construct(
        private readonly CompanyContextService $companyContextService,
        private readonly DashboardAggregateService $dashboardAggregateService,
        private readonly MeetingService $meetingService,
        private readonly AttendanceService $attendanceService,
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
        $limit = max(1, min(20, (int) ($args['limit'] ?? 8)));
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
        }

        usort($candidates, static fn(array $a, array $b): int => $b['score'] <=> $a['score']);

        $items = [];
        $rank = 1;
        foreach (array_slice($candidates, 0, $limit) as $candidate) {
            $items[] = [
                'rank' => $rank++,
                'type' => $candidate['type'],
                'title' => $candidate['title'],
                'reason' => $candidate['reason'],
                'entity_id' => $candidate['entity_id'],
                'entity_type' => $candidate['entity_type'],
                'due_at' => $candidate['due_at'],
                'distance_km' => $candidate['distance_km'],
                'suggested_action' => $candidate['suggested_action'],
                'score' => $candidate['score'],
            ];
        }

        $summaryCounts = [
            'tasks' => count(array_filter($items, static fn(array $i): bool => in_array($i['type'], ['task', 'overdue_task'], true))),
            'follow_ups' => count(array_filter($items, static fn(array $i): bool => $i['type'] === 'follow_up')),
            'meetings' => count(array_filter($items, static fn(array $i): bool => $i['type'] === 'meeting')),
            'nearby' => count(array_filter($items, static fn(array $i): bool => $i['type'] === 'nearby_visit')),
        ];

        $payload = [
            'plan_date' => now()->toDateString(),
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
            'summary_counts' => $summaryCounts,
            'focus' => $focus,
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
                });
            })
            ->orderBy('due_at')
            ->limit(15);

        if ($role === 'agent') {
            $this->applyAgentTaskScope($query, $user->id);
        }

        $candidates = [];
        foreach ($query->get() as $task) {
            $isOverdue = $task->due_at !== null && $task->due_at->isPast();
            $distanceKm = $this->distanceForTask($task, $agentLat, $agentLng);
            $priorityBonus = $this->taskPriorityBonus($task->priority);

            $score = ($isOverdue ? 80.0 : 55.0) + $priorityBonus;
            if ($distanceKm !== null) {
                $score -= min(20.0, $distanceKm * 0.5);
            }

            $candidates[] = [
                'type' => $isOverdue ? 'overdue_task' : 'task',
                'title' => (string) $task->title,
                'reason' => $isOverdue
                    ? 'Overdue task requiring immediate attention'
                    : 'Due today',
                'entity_id' => $task->id,
                'entity_type' => 'task',
                'due_at' => $task->due_at?->toIso8601String(),
                'distance_km' => $distanceKm,
                'suggested_action' => $isOverdue ? 'Complete or reschedule this task' : 'Work on this task today',
                'score' => $score,
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

            $reason = $isStale
                ? sprintf('No contact in %d days%s', $daysSince, $this->priorityLabel($lead->priority))
                : 'Follow-up action pending';

            $candidates[] = [
                'type' => 'follow_up',
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
            'from' => now()->startOfDay()->toIso8601String(),
            'to' => now()->endOfDay()->toIso8601String(),
            'per_page' => 10,
        ]);

        $candidates = [];
        foreach (collect($meetings->items()) as $meeting) {
            $startAt = $meeting->start_at instanceof Carbon
                ? $meeting->start_at
                : ($meeting->start_at !== null ? Carbon::parse($meeting->start_at) : null);

            $score = 70.0;
            if ($startAt !== null && $startAt->isPast()) {
                $score = 45.0;
            } elseif ($startAt !== null && $startAt->diffInMinutes(now()) <= 60) {
                $score = 90.0;
            }

            $candidates[] = [
                'type' => 'meeting',
                'title' => (string) $meeting->title,
                'reason' => $startAt !== null
                    ? 'Scheduled for ' . $startAt->format('H:i')
                    : 'Meeting scheduled today',
                'entity_id' => (int) $meeting->id,
                'entity_type' => 'meeting',
                'due_at' => $startAt?->toIso8601String(),
                'distance_km' => null,
                'suggested_action' => 'Prepare talking points and attend on time',
                'score' => $score,
            ];
        }

        return $candidates;
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

        $top = $items[0];
        $topDetail = $top['title'];
        if ($top['distance_km'] !== null) {
            $topDetail .= sprintf(' (%.1f km away)', $top['distance_km']);
        }

        $intro = 'Here is your prioritized plan for today: ' . implode(', ', $parts) . '.';
        $start = 'Start with ' . $topDetail . ' — ' . strtolower((string) $top['reason']) . '.';

        return $intro . ' ' . $start;
    }
}
