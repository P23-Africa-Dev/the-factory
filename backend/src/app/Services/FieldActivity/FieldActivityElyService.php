<?php

declare(strict_types=1);

namespace App\Services\FieldActivity;

use App\Enums\FieldStopClassification;
use App\Models\Company;
use App\Models\CompanyLocation;
use App\Models\FieldActivitySession;
use App\Models\FieldDailySummary;
use App\Models\FieldStop;
use App\Models\User;
use App\Services\Company\CompanyContextService;
use App\Support\CompanyClock;
use Carbon\Carbon;

class FieldActivityElyService
{
    public function __construct(
        private readonly CompanyContextService $companyContextService,
        private readonly FieldActivityAnalyticsService $analyticsService,
        private readonly FieldActivitySessionService $sessionService,
        private readonly FieldJourneyService $journeyService,
        private readonly FieldActivityVisibility $visibility,
    ) {}

    /**
     * @return array<string, mixed>
     */
    private function notVisible(string $tool): array
    {
        return [
            'tool' => $tool,
            'summary' => 'You can only view field activity for yourself and the people on your team.',
            'payload' => ['authorized' => false],
            'sources' => [$tool],
        ];
    }

    /**
     * @param  array<string, mixed>  $args
     * @return array<string, mixed>
     */
    public function dailySummary(User $user, int $companyId, array $args = []): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $company = $context['company'];
        $role = (string) $context['role'];

        $today = CompanyClock::today($company);
        $date = isset($args['date']) ? Carbon::parse((string) $args['date'])->toDateString() : $today;
        $from = isset($args['from']) ? Carbon::parse((string) $args['from'])->toDateString() : $date;
        $to = isset($args['to']) ? Carbon::parse((string) $args['to'])->toDateString() : $date;

        $targetUserId = isset($args['user_id']) ? (int) $args['user_id'] : null;
        if (is_string($args['agent_name'] ?? null) && trim((string) $args['agent_name']) !== '') {
            $resolved = User::query()
                ->whereHas('companies', static function ($q) use ($company): void {
                    $q->where('companies.id', $company->id);
                })
                ->where('name', 'like', '%' . trim((string) $args['agent_name']) . '%')
                ->value('id');
            if (is_numeric($resolved)) {
                $targetUserId = (int) $resolved;
            }
        }

        if ($role === 'agent') {
            $targetUserId = (int) $user->id;
        }

        // Supervisors: their team and themselves only.
        $visibleIds = $this->visibility->visibleUserIds($user, (int) $company->id, $role);
        if ($targetUserId !== null && $visibleIds !== null && ! in_array($targetUserId, $visibleIds, true)) {
            return $this->notVisible('field.daily_summary');
        }

        // Management asking about "today's tracking" with no named agent → team overview.
        if ($targetUserId === null) {
            if ($from !== $to) {
                return $this->teamRangeOverview($company, $from, $to, $args, $visibleIds);
            }

            return $this->teamDayOverview($company, $date, $args, $visibleIds);
        }

        if ($from !== $to) {
            $overview = $this->analyticsService->companyOverview($company, $from, $to, $targetUserId);
            $agent = collect($overview['agents'] ?? [])->first();
            $name = is_array($agent) ? (string) ($agent['name'] ?? 'Agent') : 'Agent';

            return [
                'tool' => 'field.daily_summary',
                'summary' => sprintf(
                    '%s field tracking %s to %s: %.1f km, %d visits, %d stops across %d session(s).',
                    $name,
                    $from,
                    $to,
                    ((int) ($overview['totals']['distance_meters'] ?? 0)) / 1000,
                    (int) ($overview['totals']['visit_count'] ?? 0),
                    (int) ($overview['totals']['stop_count'] ?? 0),
                    (int) ($overview['totals']['active_sessions'] ?? 0),
                ),
                'payload' => [
                    'scope' => 'agent',
                    'from' => $from,
                    'to' => $to,
                    'user_id' => $targetUserId,
                    'totals' => $overview['totals'],
                    'agents' => $overview['agents'],
                ],
                'sources' => ['field.daily_summary'],
            ];
        }

        $summary = FieldDailySummary::query()
            ->where('company_id', $company->id)
            ->where('user_id', $targetUserId)
            ->whereDate('summary_date', $date)
            ->first();

        // Every trip of that (company-local) day, not just the last one.
        [$dayStart, $dayEnd] = CompanyClock::dayBounds($company, $date);
        $daySessions = FieldActivitySession::query()
            ->with('user')
            ->where('company_id', $company->id)
            ->where('user_id', $targetUserId)
            ->whereBetween('started_at', [$dayStart, $dayEnd])
            ->orderBy('started_at')
            ->get();
        $session = $daySessions->firstWhere(fn (FieldActivitySession $s): bool => $s->isActive()) ?? $daySessions->last();

        if ($summary === null && $session === null && $targetUserId === (int) $user->id && $date === $today) {
            $today = $this->sessionService->todayForAgent($user, $company->id);

            return [
                'tool' => 'field.daily_summary',
                'summary' => $today['summary']
                    ? 'Field daily summary loaded.'
                    : 'No field tracking session or daily summary yet for this date.',
                'payload' => array_merge(['scope' => 'agent', 'date' => $date], $today),
                'sources' => ['field.daily_summary'],
            ];
        }

        $agentName = $session?->user?->name
            ?? User::query()->whereKey($targetUserId)->value('name')
            ?? 'Agent';
        $hasTrips = $daySessions->isNotEmpty();
        $distance = (int) ($hasTrips ? $daySessions->sum('distance_meters') : ($summary?->distance_meters ?? 0));
        $visits = (int) ($hasTrips ? $daySessions->sum('visit_count') : ($summary?->visit_count ?? 0));
        $stops = (int) ($hasTrips ? $daySessions->sum('stop_count') : ($summary?->stop_count ?? 0));
        $status = $session?->status?->value;

        $summaryText = ($summary === null && $session === null)
            ? sprintf('No field tracking for %s on %s.', $agentName, $date)
            : sprintf(
                '%s field tracking on %s: %.1f km, %d visits, %d stops%s%s.',
                $agentName,
                $date,
                $distance / 1000,
                $visits,
                $stops,
                $daySessions->count() > 1 ? sprintf(' across %d trips', $daySessions->count()) : '',
                $status ? " (latest trip {$status})" : '',
            );

        return [
            'tool' => 'field.daily_summary',
            'summary' => $summaryText,
            'payload' => [
                'scope' => 'agent',
                'date' => $date,
                'user_id' => $targetUserId,
                'agent_name' => $agentName,
                'session' => $session ? $this->sessionService->serializeSession($session) : null,
                'sessions' => $daySessions->map(fn (FieldActivitySession $s): array => $this->sessionService->serializeSession($s))->values()->all(),
                'summary' => $summary ? $this->sessionService->serializeSummary($summary) : null,
            ],
            'sources' => ['field.daily_summary'],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    /**
     * @param  array<string, mixed>  $args
     * @return array<string, mixed>
     */
    private function teamDayOverview(Company $company, string $date, array $args = [], ?array $visibleIds = null): array
    {
        [$dayStart, $dayEnd] = CompanyClock::dayBounds($company, $date);
        $sessions = FieldActivitySession::query()
            ->with('user')
            ->where('company_id', $company->id)
            ->when($visibleIds !== null, fn ($q) => $q->whereIn('user_id', $visibleIds))
            ->whereBetween('started_at', [$dayStart, $dayEnd])
            ->orderByDesc('started_at')
            ->get();

        $summaries = FieldDailySummary::query()
            ->where('company_id', $company->id)
            ->when($visibleIds !== null, fn ($q) => $q->whereIn('user_id', $visibleIds))
            ->whereDate('summary_date', $date)
            ->get()
            ->keyBy('user_id');

        $agentsByUser = [];
        foreach ($sessions as $session) {
            $uid = (int) $session->user_id;
            if (! isset($agentsByUser[$uid])) {
                $summary = $summaries->get($uid);
                $name = trim((string) ($session->user?->name ?? ''));
                $agentsByUser[$uid] = [
                    'user_id' => $uid,
                    'name' => $name !== '' ? $name : 'Agent',
                    'session_status' => $session->status?->value,
                    'is_actively_tracking' => $session->isActive(),
                    'started_at' => $session->started_at?->toIso8601String(),
                    'ended_at' => $session->ended_at?->toIso8601String(),
                    // Totals over every trip of the day (added below).
                    'distance_meters' => 0,
                    'visit_count' => 0,
                    'stop_count' => 0,
                    'travel_seconds' => 0,
                    'trip_count' => 0,
                ];
            } elseif ($session->isActive()) {
                $agentsByUser[$uid]['is_actively_tracking'] = true;
                $agentsByUser[$uid]['session_status'] = $session->status?->value;
            }
            $agentsByUser[$uid]['distance_meters'] += (int) $session->distance_meters;
            $agentsByUser[$uid]['visit_count'] += (int) $session->visit_count;
            $agentsByUser[$uid]['stop_count'] += (int) $session->stop_count;
            $agentsByUser[$uid]['travel_seconds'] += (int) $session->travel_seconds;
            $agentsByUser[$uid]['trip_count']++;
        }

        foreach ($summaries as $uid => $summary) {
            if (isset($agentsByUser[(int) $uid])) {
                continue;
            }
            $name = trim((string) (User::query()->whereKey((int) $uid)->value('name') ?? ''));
            $agentsByUser[(int) $uid] = [
                'user_id' => (int) $uid,
                'name' => $name !== '' ? $name : 'Agent',
                'session_status' => null,
                'is_actively_tracking' => false,
                'started_at' => null,
                'ended_at' => null,
                'distance_meters' => (int) $summary->distance_meters,
                'visit_count' => (int) $summary->visit_count,
                'stop_count' => (int) $summary->stop_count,
                'travel_seconds' => (int) $summary->travel_seconds,
            ];
        }

        $agents = array_values($agentsByUser);
        $activeNames = array_values(array_map(
            static fn (array $a): string => (string) $a['name'],
            array_filter($agents, static fn (array $a): bool => ($a['is_actively_tracking'] ?? false) === true),
        ));
        $totalDistance = (int) array_sum(array_map(static fn (array $a): int => (int) ($a['distance_meters'] ?? 0), $agents));
        $totalVisits = (int) array_sum(array_map(static fn (array $a): int => (int) ($a['visit_count'] ?? 0), $agents));
        $totalStops = (int) array_sum(array_map(static fn (array $a): int => (int) ($a['stop_count'] ?? 0), $agents));
        $activeCount = count($activeNames);

        $expand = ($args['expand_full_list'] ?? false) === true;
        $limit = max(1, min(50, (int) ($args['limit'] ?? ($expand ? 50 : 8))));
        $preview = array_slice($agents, 0, $limit);
        $truncated = count($agents) > count($preview);

        if ($agents === []) {
            $summaryText = sprintf('No field tracking sessions recorded for %s.', $date);
        } else {
            $summaryText = sprintf(
                'Field tracking on %s: %d agent(s) tracked (%.1f km, %d visits, %d stops). %d currently actively tracking%s.',
                $date,
                count($agents),
                $totalDistance / 1000,
                $totalVisits,
                $totalStops,
                $activeCount,
                $activeNames !== [] ? ': ' . implode(', ', $activeNames) : '',
            );
            foreach ($preview as $agent) {
                $summaryText .= sprintf(
                    "\n- %s: %.1f km, %d visits, %d stops%s",
                    $agent['name'],
                    ((int) $agent['distance_meters']) / 1000,
                    (int) $agent['visit_count'],
                    (int) $agent['stop_count'],
                    ($agent['is_actively_tracking'] ?? false) ? ' (active now)' : '',
                );
            }
            if ($truncated) {
                $summaryText .= sprintf("\n…and %d more. Would you like me to list all of them?", count($agents) - count($preview));
            }
        }

        return [
            'tool' => 'field.daily_summary',
            'summary' => $summaryText,
            'payload' => [
                'scope' => 'team',
                'date' => $date,
                'totals' => [
                    'agents_tracked' => count($agents),
                    'actively_tracking' => $activeCount,
                    'distance_meters' => $totalDistance,
                    'visit_count' => $totalVisits,
                    'stop_count' => $totalStops,
                ],
                'actively_tracking_names' => $activeNames,
                'agents' => $preview,
                'total' => count($agents),
                'truncated' => $truncated,
                'offer_full_list' => $truncated,
            ],
            'sources' => ['field.daily_summary'],
        ];
    }

    /**
     * @param  array<string, mixed>  $args
     * @return array<string, mixed>
     */
    private function teamRangeOverview(Company $company, string $from, string $to, array $args = [], ?array $visibleIds = null): array
    {
        $overview = $this->analyticsService->companyOverview($company, $from, $to, null, $visibleIds);
        $agents = is_array($overview['agents'] ?? null) ? $overview['agents'] : [];
        $totals = is_array($overview['totals'] ?? null) ? $overview['totals'] : [];
        $expand = ($args['expand_full_list'] ?? false) === true;
        $limit = max(1, min(50, (int) ($args['limit'] ?? ($expand ? 50 : 8))));
        $preview = array_slice($agents, 0, $limit);
        $truncated = count($agents) > count($preview);

        $summaryText = sprintf(
            'Field tracking %s to %s: %d agent(s), %.1f km, %d visits, %d stops across %d session(s).',
            $from,
            $to,
            count($agents),
            ((int) ($totals['distance_meters'] ?? 0)) / 1000,
            (int) ($totals['visit_count'] ?? 0),
            (int) ($totals['stop_count'] ?? 0),
            (int) ($totals['active_sessions'] ?? 0),
        );

        foreach ($preview as $agent) {
            if (! is_array($agent)) {
                continue;
            }
            $summaryText .= sprintf(
                "\n- %s: %.1f km, %d visits, %d stops",
                (string) ($agent['name'] ?? 'Agent'),
                ((int) ($agent['distance_meters'] ?? 0)) / 1000,
                (int) ($agent['visit_count'] ?? 0),
                (int) ($agent['stop_count'] ?? 0),
            );
        }
        if ($truncated) {
            $summaryText .= sprintf("\n…and %d more. Would you like me to list all of them?", count($agents) - count($preview));
        }

        return [
            'tool' => 'field.daily_summary',
            'summary' => $summaryText,
            'payload' => [
                'scope' => 'team',
                'from' => $from,
                'to' => $to,
                'totals' => $totals,
                'agents' => $preview,
                'total' => count($agents),
                'truncated' => $truncated,
                'offer_full_list' => $truncated,
            ],
            'sources' => ['field.daily_summary'],
        ];
    }

    /**
     * @param  array<string, mixed>  $args
     * @return array<string, mixed>
     */
    public function agentVisits(User $user, int $companyId, array $args = []): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $company = $context['company'];
        $role = (string) $context['role'];

        $today = CompanyClock::today($company);
        $fromDay = isset($args['from']) ? (string) $args['from'] : Carbon::parse($today)->subDay()->toDateString();
        $toDay = isset($args['to']) ? (string) $args['to'] : $today;
        if (isset($args['date']) && ! isset($args['from']) && ! isset($args['to'])) {
            $fromDay = (string) $args['date'];
            $toDay = (string) $args['date'];
        }
        [$from, $to] = CompanyClock::rangeBounds($company, $fromDay, $toDay);

        $targetUserId = isset($args['user_id']) ? (int) $args['user_id'] : null;
        if (is_string($args['agent_name'] ?? null) && trim((string) $args['agent_name']) !== '') {
            $resolved = User::query()
                ->whereHas('companies', static function ($q) use ($company): void {
                    $q->where('companies.id', $company->id);
                })
                ->where('name', 'like', '%' . trim((string) $args['agent_name']) . '%')
                ->value('id');
            if (is_numeric($resolved)) {
                $targetUserId = (int) $resolved;
            }
        }
        if ($role === 'agent') {
            $targetUserId = (int) $user->id;
        }

        $visibleIds = $this->visibility->visibleUserIds($user, (int) $company->id, $role);
        if ($targetUserId !== null && $visibleIds !== null && ! in_array($targetUserId, $visibleIds, true)) {
            return $this->notVisible('field.agent_visits');
        }

        $stops = FieldStop::query()
            ->where('company_id', $company->id)
            ->whereBetween('arrived_at', [$from, $to])
            ->when($targetUserId !== null, fn ($q) => $q->where('user_id', $targetUserId))
            ->when($targetUserId === null && $visibleIds !== null, fn ($q) => $q->whereIn('user_id', $visibleIds))
            ->whereIn('classification', [
                FieldStopClassification::CUSTOMER_VISIT->value,
                FieldStopClassification::LEAD_VISIT->value,
                FieldStopClassification::ORG_VISIT->value,
            ])
            ->orderByDesc('arrived_at')
            ->limit(50)
            ->get()
            ->map(fn (FieldStop $s): array => $this->sessionService->serializeStop($s))
            ->all();

        return [
            'tool' => 'field.agent_visits',
            'summary' => sprintf('Found %d field visits in range.', count($stops)),
            'payload' => [
                'from' => Carbon::parse($fromDay)->toDateString(),
                'to' => Carbon::parse($toDay)->toDateString(),
                'visits' => $stops,
            ],
            'sources' => ['field.agent_visits'],
        ];
    }

    /**
     * @param  array<string, mixed>  $args
     * @return array<string, mixed>
     */
    public function unvisitedCustomers(User $user, int $companyId, array $args = []): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $company = $context['company'];
        $days = max(1, min(180, (int) ($args['days'] ?? 30)));
        $since = now()->subDays($days);

        $visitedLeadIds = FieldStop::query()
            ->where('company_id', $company->id)
            ->whereNotNull('lead_id')
            ->where('arrived_at', '>=', $since)
            ->whereIn('classification', [
                FieldStopClassification::CUSTOMER_VISIT->value,
                FieldStopClassification::LEAD_VISIT->value,
            ])
            ->pluck('lead_id')
            ->unique()
            ->all();

        $locations = CompanyLocation::query()
            ->where('company_id', $company->id)
            ->whereNotNull('crm_lead_id')
            ->whereNotNull('latitude')
            ->whereNotNull('longitude')
            ->when($visitedLeadIds !== [], fn ($q) => $q->whereNotIn('crm_lead_id', $visitedLeadIds))
            ->with('crmLead')
            ->limit(40)
            ->get();

        $items = $locations->map(static function (CompanyLocation $loc): array {
            $lead = $loc->crmLead;

            return [
                'lead_id' => $loc->crm_lead_id,
                'lead_name' => $lead?->name,
                'location_name' => $loc->name,
                'address' => $loc->address,
                'latitude' => $loc->latitude,
                'longitude' => $loc->longitude,
                'last_interaction_at' => $lead?->last_interaction_at?->toIso8601String(),
            ];
        })->all();

        return [
            'tool' => 'field.unvisited_customers',
            'summary' => sprintf('%d map-linked leads/customers not visited in the last %d days.', count($items), $days),
            'payload' => [
                'days' => $days,
                'items' => $items,
            ],
            'sources' => ['field.unvisited_customers'],
        ];
    }

    /**
     * @param  array<string, mixed>  $args
     * @return array<string, mixed>
     */
    public function territoryCoverage(User $user, int $companyId, array $args = []): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $role = (string) $context['role'];
        $targetUserId = isset($args['user_id']) ? (int) $args['user_id'] : null;
        $visibleIds = $this->visibility->visibleUserIds($user, (int) $context['company']->id, $role);
        if ($targetUserId !== null && $visibleIds !== null && ! in_array($targetUserId, $visibleIds, true)) {
            return $this->notVisible('field.territory_coverage');
        }
        $today = CompanyClock::today($context['company']);
        $overview = $this->analyticsService->companyOverview(
            $context['company'],
            $args['from'] ?? Carbon::parse($today)->subDays(7)->toDateString(),
            $args['to'] ?? $today,
            $targetUserId,
            $visibleIds,
        );

        return [
            'tool' => 'field.territory_coverage',
            'summary' => sprintf(
                'Coverage window has %d stops across agents; heatmap has %d points.',
                (int) ($overview['totals']['stop_count'] ?? 0),
                count($overview['heatmap_points'] ?? []),
            ),
            'payload' => [
                'totals' => $overview['totals'],
                'agents' => $overview['agents'],
                'heatmap_point_count' => count($overview['heatmap_points'] ?? []),
            ],
            'sources' => ['field.territory_coverage'],
        ];
    }

    /**
     * @param  array<string, mixed>  $args
     * @return array<string, mixed>
     */
    public function travelVsVisitTime(User $user, int $companyId, array $args = []): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $role = (string) $context['role'];
        $userId = isset($args['user_id']) ? (int) $args['user_id'] : null;
        if ($role === 'agent') {
            $userId = (int) $user->id;
        }
        $visibleIds = $this->visibility->visibleUserIds($user, (int) $context['company']->id, $role);
        if ($userId !== null && $visibleIds !== null && ! in_array($userId, $visibleIds, true)) {
            return $this->notVisible('field.travel_vs_visit_time');
        }

        $today = CompanyClock::today($context['company']);
        $overview = $this->analyticsService->companyOverview(
            $context['company'],
            $args['from'] ?? $today,
            $args['to'] ?? $today,
            $userId,
            $visibleIds,
        );

        $travel = (int) ($overview['totals']['travel_seconds'] ?? 0);
        $visits = (int) ($overview['totals']['productive_visit_seconds'] ?? 0);
        $personal = (int) ($overview['totals']['personal_seconds'] ?? 0);

        return [
            'tool' => 'field.travel_vs_visit_time',
            'summary' => sprintf(
                'Travel %.1fh vs productive visits %.1fh (personal %.1fh).',
                $travel / 3600,
                $visits / 3600,
                $personal / 3600,
            ),
            'payload' => [
                'travel_seconds' => $travel,
                'productive_visit_seconds' => $visits,
                'personal_seconds' => $personal,
                'travel_efficiency' => $overview['totals']['travel_efficiency'] ?? null,
                'agents' => $overview['agents'],
            ],
            'sources' => ['field.travel_vs_visit_time'],
        ];
    }

    /**
     * @param  array<string, mixed>  $args
     * @return array<string, mixed>
     */
    public function journeyHistory(User $user, int $companyId, array $args = []): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $company = $context['company'];
        $role = (string) $context['role'];

        $resolved = $this->resolveTargetUserId($user, $company, $role, $args);
        if (($resolved['error'] ?? null) !== null) {
            return [
                'tool' => 'field.journey_history',
                'summary' => (string) $resolved['error'],
                'payload' => [
                    'agent_name' => $args['agent_name'] ?? null,
                    'items' => [],
                ],
                'sources' => ['field.journey_history'],
            ];
        }
        $targetUserId = (int) $resolved['user_id'];

        $target = User::query()->findOrFail($targetUserId);
        $filters = [
            'company_id' => $companyId,
            'from' => $args['from'] ?? null,
            'to' => $args['to'] ?? null,
            'preset' => $args['preset'] ?? 'last_30_days',
            'per_page' => min(30, max(1, (int) ($args['limit'] ?? 10))),
        ];

        $data = $this->journeyService->listForAgent($user, $target, $filters);
        $count = count($data['items'] ?? []);
        $agentLabel = (string) ($data['agent']['name'] ?? $target->name ?? 'agent');

        return [
            'tool' => 'field.journey_history',
            'summary' => $count > 0
                ? sprintf(
                    'Found %d journey(s) for %s (%s–%s).',
                    $count,
                    $agentLabel,
                    $data['summary']['from'] ?? '',
                    $data['summary']['to'] ?? '',
                )
                : sprintf(
                    'No journeys were found for %s between %s and %s.',
                    $agentLabel,
                    $data['summary']['from'] ?? ($filters['from'] ?? 'the selected range'),
                    $data['summary']['to'] ?? ($filters['to'] ?? 'now'),
                ),
            'payload' => $data,
            'sources' => ['field.journey_history'],
        ];
    }

    /**
     * @param  array<string, mixed>  $args
     * @return array<string, mixed>
     */
    public function journeyDetail(User $user, int $companyId, array $args = []): array
    {
        $sessionId = isset($args['session_id']) ? (int) $args['session_id'] : null;
        $date = isset($args['date']) ? Carbon::parse((string) $args['date'])->toDateString() : null;

        $context = $this->companyContextService->resolve($user, $companyId);
        $company = $context['company'];
        $role = (string) $context['role'];

        $resolved = $this->resolveTargetUserId($user, $company, $role, $args);
        if (($resolved['error'] ?? null) !== null) {
            return [
                'tool' => 'field.journey_detail',
                'summary' => (string) $resolved['error'],
                'payload' => null,
                'sources' => ['field.journey_detail'],
            ];
        }
        $targetUserId = (int) $resolved['user_id'];

        $session = null;
        if ($sessionId) {
            $session = FieldActivitySession::query()->find($sessionId);
        } elseif ($date) {
            [$dayStart, $dayEnd] = CompanyClock::dayBounds($company, $date);
            $session = FieldActivitySession::query()
                ->where('company_id', $companyId)
                ->where('user_id', $targetUserId)
                ->whereBetween('started_at', [$dayStart, $dayEnd])
                ->orderByDesc('started_at')
                ->first();
        }

        if ($session === null) {
            $agentName = User::query()->whereKey($targetUserId)->value('name') ?? 'agent';

            return [
                'tool' => 'field.journey_detail',
                'summary' => sprintf('No journey found for %s%s.', $agentName, $date ? " on {$date}" : ''),
                'payload' => null,
                'sources' => ['field.journey_detail'],
            ];
        }

        $detail = $this->journeyService->showJourney($user, $session, [
            'company_id' => $companyId,
            'include_route' => false,
            'include_timeline' => true,
        ]);

        $journey = $detail['journey'] ?? [];
        $stats = $detail['stats'] ?? [];

        return [
            'tool' => 'field.journey_detail',
            'summary' => sprintf(
                'Journey on %s: %.1f km, %d visits, %d stops, %d unknown.',
                $journey['date'] ?? 'unknown',
                ((int) ($stats['distance_meters'] ?? 0)) / 1000,
                (int) ($stats['visit_count'] ?? 0),
                (int) ($stats['stop_count'] ?? 0),
                (int) ($stats['unknown_stop_count'] ?? 0),
            ),
            'payload' => [
                'journey' => $journey,
                'stats' => $stats,
                'timeline' => $detail['timeline'] ?? [],
                // The trip report: what the person did at each stop (notes are
                // user-written; this tool is marked untrusted).
                'stops' => array_map(static fn (array $s): array => array_filter([
                    'arrived_at' => $s['arrived_at'] ?? null,
                    'departed_at' => $s['departed_at'] ?? null,
                    'minutes' => isset($s['duration_seconds']) ? (int) round(((int) $s['duration_seconds']) / 60) : null,
                    'place' => $s['address'] ?? null,
                    'customer_or_lead' => $s['lead_name'] ?? null,
                    'activity' => $s['classification'] ?? null,
                    'outcome' => $s['outcome'] ?? null,
                    'follow_up_at' => $s['follow_up_at'] ?? null,
                    'notes' => isset($s['notes']) ? mb_substr((string) $s['notes'], 0, 600) : null,
                    'attachments' => isset($s['attachments']) ? count($s['attachments']) : null,
                    'place_corrected' => ($s['location_status'] ?? null) === 'corrected' ?: null,
                    'added_by_person' => ($s['added_by_user'] ?? false) ?: null,
                ], static fn ($v): bool => $v !== null && $v !== ''), array_slice($detail['stops'] ?? [], 0, 40)),
                'trip_summary' => $journey['ai_summary'] ?? null,
                'report_status' => $journey['report_status'] ?? null,
                'navigation' => $detail['navigation'] ?? null,
                'agent' => $detail['agent'] ?? null,
            ],
            'sources' => ['field.journey_detail'],
        ];
    }

    /**
     * Resolve which company user a management/agent prompt is asking about.
     *
     * @param  array<string, mixed>  $args
     * @return array{user_id: int, error?: string}
     */
    private function resolveTargetUserId(User $actor, Company $company, string $role, array $args): array
    {
        if ($role === 'agent') {
            return ['user_id' => (int) $actor->id];
        }

        if (isset($args['user_id']) && is_numeric($args['user_id'])) {
            return ['user_id' => (int) $args['user_id']];
        }

        $agentName = is_string($args['agent_name'] ?? null) ? trim((string) $args['agent_name']) : '';
        if ($agentName !== '') {
            $resolved = User::query()
                ->whereHas('companies', static function ($q) use ($company): void {
                    $q->where('companies.id', $company->id);
                })
                ->where(function ($q) use ($agentName): void {
                    $q->whereRaw('LOWER(name) = ?', [strtolower($agentName)])
                        ->orWhere('name', 'like', '%' . $agentName . '%');
                })
                ->orderByRaw('CASE WHEN LOWER(name) = ? THEN 0 ELSE 1 END', [strtolower($agentName)])
                ->value('id');

            if (is_numeric($resolved)) {
                return ['user_id' => (int) $resolved];
            }

            return [
                'user_id' => (int) $actor->id,
                'error' => "I couldn't find an agent named \"{$agentName}\" in this company.",
            ];
        }

        // Management with no named agent: keep caller as default for self-scoped tools.
        return ['user_id' => (int) $actor->id];
    }
}
