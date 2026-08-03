<?php

declare(strict_types=1);

namespace App\Services\Places;

use App\Models\Company;
use App\Models\PlaceSearchEvent;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

final class PlacesUsageRecorder
{
    /**
     * @param  array<string, mixed>  $payload
     */
    public function record(array $payload): void
    {
        try {
            PlaceSearchEvent::query()->create([
                'company_id' => $payload['company_id'] ?? null,
                'user_id' => $payload['user_id'] ?? null,
                'source' => $payload['source'] ?? 'system',
                'operation' => $payload['operation'],
                'provider_final' => $payload['provider_final'] ?? null,
                'providers_tried' => $payload['providers_tried'] ?? [],
                'cache_hit' => (bool) ($payload['cache_hit'] ?? false),
                'fallback_depth' => (int) ($payload['fallback_depth'] ?? 0),
                'latency_ms' => (int) ($payload['latency_ms'] ?? 0),
                'result_count' => (int) ($payload['result_count'] ?? 0),
                'confidence' => $payload['confidence'] ?? null,
                'sku' => $payload['sku'] ?? null,
                'credits_charged' => (float) ($payload['credits_charged'] ?? 0),
                'estimated_usd' => (float) ($payload['estimated_usd'] ?? 0),
                'query_hash' => $payload['query_hash'] ?? null,
                'query_truncated' => $payload['query_truncated'] ?? null,
                'status' => $payload['status'] ?? 'ok',
                'ip_hash' => $payload['ip_hash'] ?? null,
                'sources_mix' => $payload['sources_mix'] ?? null,
                'created_at' => now(),
            ]);

            $this->bumpLiveCounters($payload);
            $this->bumpSourcesMixCounters($payload);
        } catch (\Throwable $e) {
            Log::warning('places.usage_record_failed', ['error' => $e->getMessage()]);
        }
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function bumpLiveCounters(array $payload): void
    {
        $day = now()->toDateString();
        $prefix = "places:metrics:{$day}";

        Cache::increment("{$prefix}:total");
        if (! empty($payload['cache_hit'])) {
            Cache::increment("{$prefix}:cache_hit");
        }
        if (! empty($payload['provider_final'])) {
            Cache::increment("{$prefix}:provider:{$payload['provider_final']}");
        }
        if ((int) ($payload['fallback_depth'] ?? 0) > 0) {
            Cache::increment("{$prefix}:fallback");
        }
        if (! empty($payload['source'])) {
            Cache::increment("{$prefix}:source:{$payload['source']}");
        }
        if (! empty($payload['operation'])) {
            Cache::increment("{$prefix}:op:{$payload['operation']}");
        }
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function bumpSourcesMixCounters(array $payload): void
    {
        $mix = $payload['sources_mix'] ?? null;
        if (! is_array($mix)) {
            return;
        }

        $day = now()->toDateString();
        $prefix = "places:metrics:{$day}:srcmix";
        foreach (['geoapify', 'foursquare', 'google', 'multi_source'] as $key) {
            $n = (int) ($mix[$key] ?? 0);
            if ($n > 0) {
                Cache::increment("{$prefix}:{$key}", $n);
            }
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function liveSnapshot(?string $day = null): array
    {
        $day ??= now()->toDateString();
        $prefix = "places:metrics:{$day}";
        $mixPrefix = "{$prefix}:srcmix";

        return [
            'day' => $day,
            'total' => (int) Cache::get("{$prefix}:total", 0),
            'cache_hit' => (int) Cache::get("{$prefix}:cache_hit", 0),
            'fallback' => (int) Cache::get("{$prefix}:fallback", 0),
            'providers' => [
                'geoapify' => (int) Cache::get("{$prefix}:provider:geoapify", 0),
                'foursquare' => (int) Cache::get("{$prefix}:provider:foursquare", 0),
                'google' => (int) Cache::get("{$prefix}:provider:google", 0),
            ],
            'sources' => [
                'dashboard' => (int) Cache::get("{$prefix}:source:dashboard", 0),
                'pwa' => (int) Cache::get("{$prefix}:source:pwa", 0),
                'system' => (int) Cache::get("{$prefix}:source:system", 0),
            ],
            'sources_mix' => [
                'geoapify' => (int) Cache::get("{$mixPrefix}:geoapify", 0),
                'foursquare' => (int) Cache::get("{$mixPrefix}:foursquare", 0),
                'google' => (int) Cache::get("{$mixPrefix}:google", 0),
                'multi_source' => (int) Cache::get("{$mixPrefix}:multi_source", 0),
            ],
        ];
    }

    public function googleBudgetExceeded(): bool
    {
        $budget = (int) config('places.google_daily_budget', 200);
        if ($budget <= 0) {
            return false;
        }

        $key = 'places:google_budget:'.now()->toDateString();
        $count = (int) Cache::get($key, 0);

        return $count >= $budget;
    }

    public function recordGoogleCall(): void
    {
        $budget = (int) config('places.google_daily_budget', 200);
        if ($budget <= 0) {
            return;
        }

        $key = 'places:google_budget:'.now()->toDateString();
        if (! Cache::has($key)) {
            Cache::put($key, 1, now()->endOfDay());
        } else {
            Cache::increment($key);
        }
    }
}
