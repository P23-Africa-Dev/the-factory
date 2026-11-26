<?php

declare(strict_types=1);

namespace App\Services\FieldActivity;

use App\Enums\FieldStopClassification;
use App\Models\Company;
use App\Models\FieldActivitySession;
use App\Models\FieldDailySummary;
use App\Models\FieldStop;
use App\Models\User;
use App\Support\CompanyClock;
use Carbon\Carbon;

class FieldActivityAnalyticsService
{
    /** Longest window one request may aggregate. */
    public const MAX_RANGE_DAYS = 92;

    /** Stops drawn on the heatmap (most recent first). */
    public const MAX_HEATMAP_POINTS = 2000;

    /**
     * @return array<string, mixed>
     */
    public function companyOverview(
        Company $company,
        ?string $from = null,
        ?string $to = null,
        ?int $userId = null,
        ?array $visibleUserIds = null,
    ): array {
        // Company-local dates; the window is capped so one request cannot
        // aggregate years of trips.
        $today = CompanyClock::today($company);
        $toDay = $to ? Carbon::parse($to)->toDateString() : $today;
        $fromDay = $from ? Carbon::parse($from)->toDateString() : Carbon::parse($toDay)->subDays(7)->toDateString();
        if ($fromDay > $toDay) {
            [$fromDay, $toDay] = [$toDay, $fromDay];
        }
        if (Carbon::parse($fromDay)->diffInDays(Carbon::parse($toDay)) > self::MAX_RANGE_DAYS) {
            $fromDay = Carbon::parse($toDay)->subDays(self::MAX_RANGE_DAYS)->toDateString();
        }
        [$fromDate, $toDate] = CompanyClock::rangeBounds($company, $fromDay, $toDay);

        $summaries = FieldDailySummary::query()
            ->where('company_id', $company->id)
            ->when($visibleUserIds !== null, fn ($q) => $q->whereIn('user_id', $visibleUserIds))
            ->whereBetween('summary_date', [$fromDay, $toDay])
            ->when($userId !== null, fn ($q) => $q->where('user_id', $userId))
            ->get();

        $sessions = FieldActivitySession::query()
            ->where('company_id', $company->id)
            ->when($visibleUserIds !== null, fn ($q) => $q->whereIn('user_id', $visibleUserIds))
            ->whereBetween('started_at', [$fromDate, $toDate])
            ->when($userId !== null, fn ($q) => $q->where('user_id', $userId))
            ->get();

        $stops = FieldStop::query()
            ->where('company_id', $company->id)
            ->when($visibleUserIds !== null, fn ($q) => $q->whereIn('user_id', $visibleUserIds))
            ->whereBetween('arrived_at', [$fromDate, $toDate])
            ->when($userId !== null, fn ($q) => $q->where('user_id', $userId))
            ->get();

        $personalSeconds = $stops
            ->where('classification', FieldStopClassification::PERSONAL)
            ->sum('duration_seconds');
        $visitSeconds = $stops
            ->filter(static fn (FieldStop $s): bool => $s->isVisit())
            ->sum('duration_seconds');

        $names = User::query()
            ->whereIn('id', $sessions->pluck('user_id')->unique()->values()->all())
            ->pluck('name', 'id');
        $timezone = CompanyClock::timezone($company);

        $byAgent = $sessions->groupBy('user_id')->map(function ($rows, $uid) use ($names, $timezone) {
            // Days worked = distinct company-local dates with a trip (several
            // trips on one day count once).
            $days = $rows
                ->map(static fn (FieldActivitySession $s): ?string => $s->started_at?->copy()->setTimezone($timezone)->toDateString())
                ->filter()
                ->unique()
                ->count();

            return [
                'user_id' => (int) $uid,
                'name' => $names->get((int) $uid),
                'distance_meters' => (int) $rows->sum('distance_meters'),
                'travel_seconds' => (int) $rows->sum('travel_seconds'),
                'visit_count' => (int) $rows->sum('visit_count'),
                'stop_count' => (int) $rows->sum('stop_count'),
                'unknown_stop_count' => (int) $rows->sum('unknown_stop_count'),
                'days' => $days,
            ];
        })->values()->all();

        $heatmap = $stops->sortByDesc('arrived_at')->take(self::MAX_HEATMAP_POINTS)->values()->map(static fn (FieldStop $s): array => [
            'latitude' => $s->latitude,
            'longitude' => $s->longitude,
            'classification' => $s->classification?->value,
            'duration_seconds' => $s->duration_seconds,
            'arrived_at' => $s->arrived_at?->toIso8601String(),
        ])->all();

        $totalTravel = (int) ($sessions->sum('travel_seconds') ?: $summaries->sum('travel_seconds'));
        $totalDistance = (int) ($sessions->sum('distance_meters') ?: $summaries->sum('distance_meters'));
        $totalVisits = (int) $sessions->sum('visit_count');

        return [
            'from' => $fromDay,
            'to' => $toDay,
            'heatmap_truncated' => $stops->count() > self::MAX_HEATMAP_POINTS,
            'totals' => [
                'active_sessions' => $sessions->count(),
                'distance_meters' => $totalDistance,
                'travel_seconds' => $totalTravel,
                'stationary_seconds' => (int) ($sessions->sum('stationary_seconds') ?: $summaries->sum('stationary_seconds')),
                'stop_count' => (int) ($sessions->sum('stop_count') ?: $summaries->sum('stop_count')),
                'visit_count' => (int) ($totalVisits ?: $summaries->sum('visit_count')),
                'unknown_stop_count' => (int) ($sessions->sum('unknown_stop_count') ?: $summaries->sum('unknown_stop_count')),
                'personal_seconds' => (int) $personalSeconds,
                'productive_visit_seconds' => (int) $visitSeconds,
                'travel_efficiency' => $totalTravel > 0
                    ? round($visitSeconds / max($totalTravel + $visitSeconds, 1), 3)
                    : null,
                'avg_distance_per_visit_meters' => $totalVisits > 0
                    ? (int) round($totalDistance / $totalVisits)
                    : null,
            ],
            'agents' => $byAgent,
            'heatmap_points' => $heatmap,
        ];
    }
}
