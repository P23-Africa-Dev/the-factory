<?php

declare(strict_types=1);

namespace App\Services\FieldActivity;

use App\Enums\FieldStopClassification;
use App\Models\CompanyLocation;
use App\Models\FieldDailySummary;
use App\Models\FieldStop;
use App\Models\User;
use App\Services\Company\CompanyContextService;
use Carbon\Carbon;

class FieldActivityElyService
{
    public function __construct(
        private readonly CompanyContextService $companyContextService,
        private readonly FieldActivityAnalyticsService $analyticsService,
        private readonly FieldActivitySessionService $sessionService,
    ) {}

    /**
     * @param  array<string, mixed>  $args
     * @return array<string, mixed>
     */
    public function dailySummary(User $user, int $companyId, array $args = []): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $company = $context['company'];
        $role = (string) $context['role'];

        $date = isset($args['date']) ? Carbon::parse((string) $args['date'])->toDateString() : now()->toDateString();
        $targetUserId = isset($args['user_id']) ? (int) $args['user_id'] : (int) $user->id;

        if ($role === 'agent') {
            $targetUserId = (int) $user->id;
        }

        $summary = FieldDailySummary::query()
            ->where('company_id', $company->id)
            ->where('user_id', $targetUserId)
            ->whereDate('summary_date', $date)
            ->first();

        if ($summary === null && $targetUserId === (int) $user->id) {
            $today = $this->sessionService->todayForAgent($user, $company->id);

            return [
                'tool' => 'field.daily_summary',
                'summary' => $today['summary']
                    ? 'Field daily summary loaded.'
                    : 'No field daily summary yet for this date.',
                'payload' => $today,
                'sources' => ['field.daily_summary'],
            ];
        }

        return [
            'tool' => 'field.daily_summary',
            'summary' => $summary
                ? sprintf(
                    'Field day: %.1f km, %d visits, %d unknown stops.',
                    ((int) $summary->distance_meters) / 1000,
                    (int) $summary->visit_count,
                    (int) $summary->unknown_stop_count,
                )
                : 'No field daily summary for that date.',
            'payload' => $summary ? $this->sessionService->serializeSummary($summary) : null,
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

        $from = isset($args['from']) ? Carbon::parse((string) $args['from'])->startOfDay() : now()->subDay()->startOfDay();
        $to = isset($args['to']) ? Carbon::parse((string) $args['to'])->endOfDay() : now()->endOfDay();
        $targetUserId = isset($args['user_id']) ? (int) $args['user_id'] : null;
        if ($role === 'agent') {
            $targetUserId = (int) $user->id;
        }

        $stops = FieldStop::query()
            ->where('company_id', $company->id)
            ->whereBetween('arrived_at', [$from, $to])
            ->when($targetUserId !== null, fn ($q) => $q->where('user_id', $targetUserId))
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
                'from' => $from->toDateString(),
                'to' => $to->toDateString(),
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
        $overview = $this->analyticsService->companyOverview(
            $context['company'],
            $args['from'] ?? now()->subDays(7)->toDateString(),
            $args['to'] ?? now()->toDateString(),
            isset($args['user_id']) ? (int) $args['user_id'] : null,
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

        $overview = $this->analyticsService->companyOverview(
            $context['company'],
            $args['from'] ?? now()->toDateString(),
            $args['to'] ?? now()->toDateString(),
            $userId,
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
}
