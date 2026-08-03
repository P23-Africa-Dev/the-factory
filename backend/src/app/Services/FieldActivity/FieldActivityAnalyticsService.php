<?php

declare(strict_types=1);

namespace App\Services\FieldActivity;

use App\Enums\FieldStopClassification;
use App\Models\Company;
use App\Models\FieldActivitySession;
use App\Models\FieldDailySummary;
use App\Models\FieldStop;
use App\Models\User;
use Carbon\Carbon;

class FieldActivityAnalyticsService
{
    /**
     * @return array<string, mixed>
     */
    public function companyOverview(
        Company $company,
        ?string $from = null,
        ?string $to = null,
        ?int $userId = null,
    ): array {
        $fromDate = $from ? Carbon::parse($from)->startOfDay() : now()->subDays(7)->startOfDay();
        $toDate = $to ? Carbon::parse($to)->endOfDay() : now()->endOfDay();

        $summaries = FieldDailySummary::query()
            ->where('company_id', $company->id)
            ->whereBetween('summary_date', [$fromDate->toDateString(), $toDate->toDateString()])
            ->when($userId !== null, fn ($q) => $q->where('user_id', $userId))
            ->get();

        $sessions = FieldActivitySession::query()
            ->where('company_id', $company->id)
            ->whereBetween('started_at', [$fromDate, $toDate])
            ->when($userId !== null, fn ($q) => $q->where('user_id', $userId))
            ->get();

        $stops = FieldStop::query()
            ->where('company_id', $company->id)
            ->whereBetween('arrived_at', [$fromDate, $toDate])
            ->when($userId !== null, fn ($q) => $q->where('user_id', $userId))
            ->get();

        $personalSeconds = $stops
            ->where('classification', FieldStopClassification::PERSONAL)
            ->sum('duration_seconds');
        $visitSeconds = $stops
            ->filter(static fn (FieldStop $s): bool => $s->isVisit())
            ->sum('duration_seconds');

        $byAgent = $summaries->groupBy('user_id')->map(function ($rows, $uid) {
            $user = User::query()->find($uid);

            return [
                'user_id' => (int) $uid,
                'name' => $user?->name,
                'distance_meters' => (int) $rows->sum('distance_meters'),
                'travel_seconds' => (int) $rows->sum('travel_seconds'),
                'visit_count' => (int) $rows->sum('visit_count'),
                'stop_count' => (int) $rows->sum('stop_count'),
                'unknown_stop_count' => (int) $rows->sum('unknown_stop_count'),
                'days' => $rows->count(),
            ];
        })->values()->all();

        $heatmap = $stops->map(static fn (FieldStop $s): array => [
            'latitude' => $s->latitude,
            'longitude' => $s->longitude,
            'classification' => $s->classification?->value,
            'duration_seconds' => $s->duration_seconds,
            'arrived_at' => $s->arrived_at?->toIso8601String(),
        ])->all();

        $totalTravel = (int) $summaries->sum('travel_seconds');
        $totalDistance = (int) $summaries->sum('distance_meters');
        $totalVisits = (int) $summaries->sum('visit_count');

        return [
            'from' => $fromDate->toDateString(),
            'to' => $toDate->toDateString(),
            'totals' => [
                'active_sessions' => $sessions->count(),
                'distance_meters' => $totalDistance,
                'travel_seconds' => $totalTravel,
                'stationary_seconds' => (int) $summaries->sum('stationary_seconds'),
                'stop_count' => (int) $summaries->sum('stop_count'),
                'visit_count' => $totalVisits,
                'unknown_stop_count' => (int) $summaries->sum('unknown_stop_count'),
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
