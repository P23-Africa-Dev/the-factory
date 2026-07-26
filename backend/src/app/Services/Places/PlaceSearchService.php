<?php

declare(strict_types=1);

namespace App\Services\Places;

use App\Contracts\Places\PlaceSearchProviderInterface;
use App\DTO\Places\PlaceResult;
use App\DTO\Places\PlaceSearchOutcome;
use App\DTO\Places\PlaceSuggestion;
use App\Models\Company;
use App\Models\User;
use App\Services\Billing\MapCreditService;
use App\Services\Places\Exceptions\ProviderException;
use App\Services\Places\Providers\FoursquareProvider;
use App\Services\Places\Providers\GeoapifyProvider;
use App\Services\Places\Providers\GooglePlacesProvider;
use Illuminate\Support\Facades\Log;

final class PlaceSearchService
{
    /** @var list<PlaceSearchProviderInterface> */
    private array $providers;

    public function __construct(
        private readonly GeoapifyProvider $geoapify,
        private readonly FoursquareProvider $foursquare,
        private readonly GooglePlacesProvider $google,
        private readonly PlaceQualityScorer $scorer,
        private readonly PlacesCache $cache,
        private readonly PlacesUsageRecorder $usage,
        private readonly MapCreditService $mapCredits,
    ) {
        $this->providers = [$this->geoapify, $this->foursquare, $this->google];
    }

    /**
     * @return PlaceSearchOutcome
     */
    public function autocomplete(
        string $query,
        ?Company $company = null,
        ?User $user = null,
        ?float $lat = null,
        ?float $lng = null,
        int $limit = 6,
        string $source = 'dashboard',
        ?string $ip = null,
    ): PlaceSearchOutcome {
        return $this->runListOperation(
            operation: 'autocomplete',
            sku: 'places.autocomplete',
            query: $query,
            company: $company,
            user: $user,
            lat: $lat,
            lng: $lng,
            limit: $limit,
            source: $source,
            ip: $ip,
            invoker: fn (PlaceSearchProviderInterface $p): array => $p->autocomplete($query, $lat, $lng, $limit),
        );
    }

    public function search(
        string $query,
        ?Company $company = null,
        ?User $user = null,
        ?float $lat = null,
        ?float $lng = null,
        int $limit = 10,
        string $source = 'dashboard',
        ?string $ip = null,
    ): PlaceSearchOutcome {
        return $this->runListOperation(
            operation: 'search',
            sku: 'places.search',
            query: $query,
            company: $company,
            user: $user,
            lat: $lat,
            lng: $lng,
            limit: $limit,
            source: $source,
            ip: $ip,
            invoker: fn (PlaceSearchProviderInterface $p): array => $p->search($query, $lat, $lng, $limit),
        );
    }

    /**
     * @param  list<string>|null  $categories
     */
    public function nearby(
        float $lat,
        float $lng,
        int $radiusM = 1500,
        ?array $categories = null,
        int $limit = 20,
        ?Company $company = null,
        ?User $user = null,
        string $source = 'dashboard',
        ?string $ip = null,
    ): PlaceSearchOutcome {
        return $this->runListOperation(
            operation: 'nearby',
            sku: 'places.nearby',
            query: null,
            company: $company,
            user: $user,
            lat: $lat,
            lng: $lng,
            limit: $limit,
            source: $source,
            ip: $ip,
            cacheParts: [$lat, $lng, $radiusM, $categories ?? [], $limit],
            invoker: fn (PlaceSearchProviderInterface $p): array => $p->nearby($lat, $lng, $radiusM, $categories, $limit),
        );
    }

    public function details(
        string $id,
        string $providerHint,
        ?Company $company = null,
        ?User $user = null,
        string $source = 'dashboard',
        ?string $ip = null,
    ): PlaceSearchOutcome {
        $started = hrtime(true);
        $cacheKey = $this->cache->makeKey('details', [$providerHint, $id]);
        $cached = $this->cache->get('details', $cacheKey);
        if (is_array($cached)) {
            $outcome = $this->outcomeFromCache($cached, $started);
            $this->logEvent($outcome, 'places.details', $company, $user, $source, $ip, null, $id);

            return $outcome;
        }

        $provider = $this->providerByName($providerHint) ?? $this->geoapify;
        $tried = [];
        $result = null;
        $creditsMeta = null;

        if ($company !== null) {
            $snapshot = $this->mapCredits->snapshot($company);
            if (! empty($snapshot['metered']) && ! empty($snapshot['exhausted'])) {
                return $this->emptyBlocked($started, [
                    'balance' => $snapshot['balance'] ?? 0,
                    'low' => true,
                    'blocked' => true,
                    'metered' => true,
                ]);
            }
        }

        if ($provider->isConfigured()) {
            $tried[] = $provider->name();
            try {
                $result = $provider->details($id);
            } catch (ProviderException $e) {
                Log::info('places.provider_failed', ['provider' => $e->provider, 'reason' => $e->reason, 'op' => 'details']);
            }
        }

        // Fallback chain for details if hinted provider failed.
        if ($result === null && (bool) config('places.fallback_enabled', true)) {
            foreach ($this->providers as $fallback) {
                if ($fallback->name() === $provider->name() || ! $fallback->isConfigured()) {
                    continue;
                }
                if ($fallback->name() === 'google' && $this->usage->googleBudgetExceeded()) {
                    continue;
                }
                $tried[] = $fallback->name();
                try {
                    $result = $fallback->details($id);
                    if ($result !== null) {
                        if ($fallback->name() === 'google') {
                            $this->usage->recordGoogleCall();
                        }
                        break;
                    }
                } catch (ProviderException $e) {
                    Log::info('places.provider_failed', ['provider' => $e->provider, 'reason' => $e->reason, 'op' => 'details']);
                }
            }
        }

        if ($result !== null) {
            $gate = $this->chargeIfNeeded($company, 'places.details', $result->provider, $source);
            if ($gate['blocked']) {
                return $this->emptyBlocked($started, $gate['credits']);
            }
            $creditsMeta = $gate['credits'];
        }

        $results = $result !== null ? [$result] : [];
        $confidence = $this->scorer->score($results, 'details');
        $latencyMs = (int) ((hrtime(true) - $started) / 1_000_000);
        $outcome = new PlaceSearchOutcome(
            results: $results,
            providerFinal: $result?->provider,
            providersTried: $tried,
            cacheHit: false,
            fallbackDepth: max(0, count($tried) - 1),
            confidence: $confidence,
            latencyMs: $latencyMs,
            credits: $creditsMeta,
            status: $results === [] ? 'empty' : 'ok',
        );

        if ($result !== null) {
            $this->cache->put('details', $cacheKey, $outcome->toApiEnvelope());
        }

        $this->logEvent($outcome, 'places.details', $company, $user, $source, $ip, null, $id);

        return $outcome;
    }

    public function geocode(
        string $query,
        ?Company $company = null,
        ?User $user = null,
        string $source = 'system',
        ?string $ip = null,
    ): PlaceSearchOutcome {
        return $this->runSingleOperation(
            operation: 'geocode',
            sku: 'places.geocode',
            query: $query,
            company: $company,
            user: $user,
            lat: null,
            lng: null,
            source: $source,
            ip: $ip,
            invoker: fn (PlaceSearchProviderInterface $p): ?PlaceResult => $p->geocode($query),
        );
    }

    public function reverseGeocode(
        float $lat,
        float $lng,
        ?Company $company = null,
        ?User $user = null,
        string $source = 'system',
        ?string $ip = null,
    ): PlaceSearchOutcome {
        return $this->runSingleOperation(
            operation: 'reverse',
            sku: 'places.reverse',
            query: null,
            company: $company,
            user: $user,
            lat: $lat,
            lng: $lng,
            source: $source,
            ip: $ip,
            cacheParts: [$lat, $lng],
            invoker: fn (PlaceSearchProviderInterface $p): ?PlaceResult => $p->reverseGeocode($lat, $lng),
        );
    }

    /**
     * @param  callable(PlaceSearchProviderInterface): list<PlaceSuggestion|PlaceResult>  $invoker
     * @param  list<mixed>|null  $cacheParts
     */
    private function runListOperation(
        string $operation,
        string $sku,
        ?string $query,
        ?Company $company,
        ?User $user,
        ?float $lat,
        ?float $lng,
        int $limit,
        string $source,
        ?string $ip,
        callable $invoker,
        ?array $cacheParts = null,
    ): PlaceSearchOutcome {
        $started = hrtime(true);
        $parts = $cacheParts ?? [strtolower(trim((string) $query)), $lat, $lng, $limit];
        $cacheKey = $this->cache->makeKey($operation, $parts);
        $cached = $this->cache->get($operation, $cacheKey);
        if (is_array($cached)) {
            $outcome = $this->outcomeFromCache($cached, $started);
            $this->logEvent($outcome, $sku, $company, $user, $source, $ip, $query);

            return $outcome;
        }

        $tried = [];
        $best = [];
        $bestProvider = null;
        $bestScore = 0.0;
        $creditsMeta = null;
        $fallbackDepth = 0;

        if ($company !== null) {
            $snapshot = $this->mapCredits->snapshot($company);
            if (! empty($snapshot['metered']) && ! empty($snapshot['exhausted'])) {
                return $this->emptyBlocked($started, [
                    'balance' => $snapshot['balance'] ?? 0,
                    'low' => true,
                    'blocked' => true,
                    'metered' => true,
                ]);
            }
        }

        foreach ($this->orderedProviders($query, $operation) as $index => $provider) {
            if (! $provider->isConfigured()) {
                continue;
            }
            if ($provider->name() === 'google') {
                if (! (bool) config('places.fallback_enabled', true) && $index > 0) {
                    continue;
                }
                if ($this->usage->googleBudgetExceeded()) {
                    continue;
                }
            }

            $tried[] = $provider->name();

            try {
                $results = $invoker($provider);
            } catch (ProviderException $e) {
                Log::info('places.provider_failed', [
                    'provider' => $e->provider,
                    'reason' => $e->reason,
                    'op' => $operation,
                ]);
                continue;
            }

            // Empty / failed quality attempts are not billed.
            if ($results === []) {
                continue;
            }

            if ($provider->name() === 'google') {
                $this->usage->recordGoogleCall();
            }

            $score = $this->scorer->score($results, $operation, $query, $lat, $lng);
            if ($score > $bestScore) {
                $best = $results;
                $bestScore = $score;
                $bestProvider = $provider->name();
                $fallbackDepth = max(0, count($tried) - 1);
            }

            if ($this->scorer->isAdequateForProvider($results, $operation, $provider->name(), $query)) {
                $best = $results;
                $bestProvider = $provider->name();
                $bestScore = $score;
                $fallbackDepth = max(0, count($tried) - 1);
                break;
            }
        }

        if ($bestProvider !== null && $best !== []) {
            $gate = $this->chargeIfNeeded($company, $sku, $bestProvider, $source);
            if ($gate['blocked']) {
                return $this->emptyBlocked($started, $gate['credits']);
            }
            $creditsMeta = $gate['credits'];
        }

        $latencyMs = (int) ((hrtime(true) - $started) / 1_000_000);
        $outcome = new PlaceSearchOutcome(
            results: $best,
            providerFinal: $bestProvider,
            providersTried: $tried,
            cacheHit: false,
            fallbackDepth: $fallbackDepth,
            confidence: $bestScore,
            latencyMs: $latencyMs,
            credits: $creditsMeta,
            status: $best === [] ? 'empty' : 'ok',
        );

        if ($best !== []) {
            $this->cache->put($operation, $cacheKey, $outcome->toApiEnvelope());
        }

        $this->logEvent($outcome, $sku, $company, $user, $source, $ip, $query);

        return $outcome;
    }

    /**
     * @param  callable(PlaceSearchProviderInterface): (?PlaceResult)  $invoker
     * @param  list<mixed>|null  $cacheParts
     */
    private function runSingleOperation(
        string $operation,
        string $sku,
        ?string $query,
        ?Company $company,
        ?User $user,
        ?float $lat,
        ?float $lng,
        string $source,
        ?string $ip,
        callable $invoker,
        ?array $cacheParts = null,
    ): PlaceSearchOutcome {
        return $this->runListOperation(
            operation: $operation,
            sku: $sku,
            query: $query,
            company: $company,
            user: $user,
            lat: $lat,
            lng: $lng,
            limit: 1,
            source: $source,
            ip: $ip,
            cacheParts: $cacheParts,
            invoker: function (PlaceSearchProviderInterface $p) use ($invoker): array {
                $one = $invoker($p);

                return $one !== null ? [$one] : [];
            },
        );
    }

    /**
     * @return list<PlaceSearchProviderInterface>
     */
    private function orderedProviders(?string $query, string $operation): array
    {
        // Business-heavy autocomplete/search: still Geoapify first, but Foursquare
        // will be reached more often via lower quality threshold in scorer.
        return $this->providers;
    }

    private function providerByName(string $name): ?PlaceSearchProviderInterface
    {
        foreach ($this->providers as $provider) {
            if ($provider->name() === $name) {
                return $provider;
            }
        }

        return null;
    }

    /**
     * @return array{blocked: bool, credits: array<string, mixed>|null}
     */
    private function chargeIfNeeded(?Company $company, string $sku, string $provider, string $source): array
    {
        if ($company === null) {
            return ['blocked' => false, 'credits' => null];
        }

        $units = (float) config("places.providers.{$provider}.credit_units", 1.0);
        $result = $this->mapCredits->consume(
            company: $company,
            sku: $sku,
            source: $source,
            units: $units,
            meta: [
                'provider' => $provider,
                'operation' => $sku,
            ],
        );

        $credits = [
            'balance' => $result['balance'] ?? null,
            'low' => (bool) ($result['low'] ?? false),
            'blocked' => (bool) ($result['blocked'] ?? false),
            'metered' => (bool) ($result['metered'] ?? false),
        ];

        return [
            'blocked' => (bool) ($result['blocked'] ?? false) || ! (bool) ($result['allowed'] ?? true),
            'credits' => $credits,
        ];
    }

    /**
     * @param  array<string, mixed>|null  $credits
     */
    private function emptyBlocked(int|float $started, ?array $credits): PlaceSearchOutcome
    {
        $latencyMs = (int) ((hrtime(true) - $started) / 1_000_000);

        return new PlaceSearchOutcome(
            results: [],
            providerFinal: null,
            providersTried: [],
            cacheHit: false,
            fallbackDepth: 0,
            confidence: 0.0,
            latencyMs: $latencyMs,
            credits: $credits,
            status: 'credits_blocked',
        );
    }

    /**
     * @param  array<string, mixed>  $cached
     */
    private function outcomeFromCache(array $cached, int|float $started): PlaceSearchOutcome
    {
        $data = is_array($cached['data'] ?? null) ? $cached['data'] : [];
        $meta = is_array($cached['meta'] ?? null) ? $cached['meta'] : [];
        $results = [];
        foreach ($data as $row) {
            if (! is_array($row)) {
                continue;
            }
            if (isset($row['latitude'], $row['longitude']) && is_numeric($row['latitude']) && is_numeric($row['longitude'])) {
                $results[] = new PlaceResult(
                    id: (string) ($row['id'] ?? ''),
                    name: (string) ($row['name'] ?? 'Place'),
                    formattedAddress: (string) ($row['formatted_address'] ?? ''),
                    latitude: (float) $row['latitude'],
                    longitude: (float) $row['longitude'],
                    provider: (string) ($row['provider'] ?? 'cache'),
                    confidence: isset($row['confidence']) ? (float) $row['confidence'] : null,
                    categories: is_array($row['categories'] ?? null) ? array_values(array_map('strval', $row['categories'])) : [],
                    phone: isset($row['phone']) ? (string) $row['phone'] : null,
                    website: isset($row['website']) ? (string) $row['website'] : null,
                    rating: isset($row['rating']) ? (float) $row['rating'] : null,
                    openingHours: isset($row['opening_hours']) ? (string) $row['opening_hours'] : null,
                );
            } else {
                $results[] = new PlaceSuggestion(
                    id: (string) ($row['id'] ?? ''),
                    name: (string) ($row['name'] ?? 'Place'),
                    formattedAddress: (string) ($row['formatted_address'] ?? ''),
                    provider: (string) ($row['provider'] ?? 'cache'),
                    latitude: isset($row['latitude']) ? (float) $row['latitude'] : null,
                    longitude: isset($row['longitude']) ? (float) $row['longitude'] : null,
                    confidence: isset($row['confidence']) ? (float) $row['confidence'] : null,
                    categories: is_array($row['categories'] ?? null) ? array_values(array_map('strval', $row['categories'])) : [],
                );
            }
        }

        return new PlaceSearchOutcome(
            results: $results,
            providerFinal: isset($meta['provider']) ? (string) $meta['provider'] : null,
            providersTried: is_array($meta['providers_tried'] ?? null) ? array_values(array_map('strval', $meta['providers_tried'])) : [],
            cacheHit: true,
            fallbackDepth: (int) ($meta['fallback_depth'] ?? 0),
            confidence: (float) ($meta['confidence'] ?? 0),
            latencyMs: (int) ((hrtime(true) - $started) / 1_000_000),
            credits: null,
            status: 'ok',
        );
    }

    private function logEvent(
        PlaceSearchOutcome $outcome,
        string $sku,
        ?Company $company,
        ?User $user,
        string $source,
        ?string $ip,
        ?string $query,
        ?string $id = null,
    ): void {
        $provider = $outcome->providerFinal;
        $estimated = 0.0;
        if ($provider && ! $outcome->cacheHit) {
            $op = str_replace('places.', '', $sku);
            $estimated = (float) config("places.cost_estimates_usd.{$provider}.{$op}", 0);
        }

        $hashSeed = $query ?? $id ?? '';
        $truncated = null;
        if ($query !== null && (bool) config('places.store_truncated_query', false)) {
            $truncated = mb_substr($query, 0, 80);
        }

        $this->usage->record([
            'company_id' => $company?->id,
            'user_id' => $user?->id,
            'source' => $source,
            'operation' => str_replace('places.', '', $sku),
            'provider_final' => $outcome->providerFinal,
            'providers_tried' => $outcome->providersTried,
            'cache_hit' => $outcome->cacheHit,
            'fallback_depth' => $outcome->fallbackDepth,
            'latency_ms' => $outcome->latencyMs,
            'result_count' => count($outcome->results),
            'confidence' => $outcome->confidence,
            'sku' => $sku,
            'credits_charged' => $outcome->cacheHit ? 0 : (float) ($outcome->credits['charged'] ?? 0),
            'estimated_usd' => $estimated,
            'query_hash' => $hashSeed !== '' ? hash('sha256', strtolower(trim($hashSeed))) : null,
            'query_truncated' => $truncated,
            'status' => $outcome->status,
            'ip_hash' => $ip !== null ? hash('sha256', $ip) : null,
        ]);
    }
}
