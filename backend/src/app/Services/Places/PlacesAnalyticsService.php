<?php

declare(strict_types=1);

namespace App\Services\Places;

use App\Models\Company;
use App\Models\PlaceSearchEvent;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

final class PlacesAnalyticsService
{
    public function __construct(
        private readonly PlacesUsageRecorder $usage,
        private readonly PlacesSettingsService $settings,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function overview(int $days = 7): array
    {
        $from = Carbon::now()->subDays(max(1, $days))->startOfDay();
        $live = $this->usage->liveSnapshot();

        $base = PlaceSearchEvent::query()->where('created_at', '>=', $from);
        $total = (clone $base)->count();
        $cacheHits = (clone $base)->where('cache_hit', true)->count();
        $fallbacks = (clone $base)->where('fallback_depth', '>', 0)->count();
        $avgLatency = (float) ((clone $base)->avg('latency_ms') ?? 0);
        $estCost = (float) ((clone $base)->sum('estimated_usd') ?? 0);

        $byProvider = PlaceSearchEvent::query()
            ->where('created_at', '>=', $from)
            ->whereNotNull('provider_final')
            ->select('provider_final', DB::raw('COUNT(*) as c'))
            ->groupBy('provider_final')
            ->pluck('c', 'provider_final')
            ->all();

        $bySource = PlaceSearchEvent::query()
            ->where('created_at', '>=', $from)
            ->select('source', DB::raw('COUNT(*) as c'))
            ->groupBy('source')
            ->pluck('c', 'source')
            ->all();

        $byOperation = PlaceSearchEvent::query()
            ->where('created_at', '>=', $from)
            ->select('operation', DB::raw('COUNT(*) as c'))
            ->groupBy('operation')
            ->pluck('c', 'operation')
            ->all();

        $providerTotal = max(1, array_sum($byProvider));

        return [
            'days' => $days,
            'from' => $from->toIso8601String(),
            'total' => $total,
            'cache_hit_count' => $cacheHits,
            'cache_hit_pct' => $total > 0 ? round(($cacheHits / $total) * 100, 1) : 0.0,
            'fallback_count' => $fallbacks,
            'fallback_pct' => $total > 0 ? round(($fallbacks / $total) * 100, 1) : 0.0,
            'avg_latency_ms' => round($avgLatency, 1),
            'estimated_usd' => round($estCost, 4),
            'provider_counts' => $byProvider,
            'provider_pct' => [
                'geoapify' => round((((int) ($byProvider['geoapify'] ?? 0)) / $providerTotal) * 100, 1),
                'foursquare' => round((((int) ($byProvider['foursquare'] ?? 0)) / $providerTotal) * 100, 1),
                'google' => round((((int) ($byProvider['google'] ?? 0)) / $providerTotal) * 100, 1),
            ],
            'sources' => $bySource,
            'operations' => $byOperation,
            'live_today' => $live,
            'settings' => $this->settings->snapshot(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function topCompanies(int $days = 7, int $limit = 20): array
    {
        $from = Carbon::now()->subDays(max(1, $days))->startOfDay();

        $rows = PlaceSearchEvent::query()
            ->where('created_at', '>=', $from)
            ->whereNotNull('company_id')
            ->select('company_id', DB::raw('COUNT(*) as requests'), DB::raw('SUM(estimated_usd) as est_usd'), DB::raw('SUM(CASE WHEN provider_final = "google" THEN 1 ELSE 0 END) as google_calls'))
            ->groupBy('company_id')
            ->orderByDesc('requests')
            ->limit($limit)
            ->get();

        $companies = Company::query()->whereIn('id', $rows->pluck('company_id'))->get()->keyBy('id');

        return $rows->map(function ($row) use ($companies) {
            $company = $companies->get($row->company_id);

            return [
                'company_id' => $row->company_id,
                'company_name' => $company?->name ?? 'Unknown',
                'requests' => (int) $row->requests,
                'estimated_usd' => round((float) $row->est_usd, 4),
                'google_calls' => (int) $row->google_calls,
            ];
        })->all();
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function recentEvents(int $limit = 50): array
    {
        return PlaceSearchEvent::query()
            ->with('company:id,name')
            ->latest('created_at')
            ->limit($limit)
            ->get()
            ->map(static fn (PlaceSearchEvent $e): array => [
                'id' => $e->id,
                'created_at' => $e->created_at?->toIso8601String(),
                'company' => $e->company?->name,
                'source' => $e->source,
                'operation' => $e->operation,
                'provider' => $e->provider_final,
                'cache_hit' => $e->cache_hit,
                'fallback_depth' => $e->fallback_depth,
                'latency_ms' => $e->latency_ms,
                'result_count' => $e->result_count,
                'status' => $e->status,
                'query_hash' => $e->query_hash,
            ])
            ->all();
    }
}
