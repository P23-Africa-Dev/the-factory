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
            invoker: fn (PlaceSearchProviderInterface $p, ?string $q): array => $p->autocomplete((string) $q, $lat, $lng, $limit),
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
            invoker: fn (PlaceSearchProviderInterface $p, ?string $q): array => $p->search((string) $q, $lat, $lng, $limit),
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
            invoker: fn (PlaceSearchProviderInterface $p, ?string $q): array => $p->nearby($lat, $lng, $radiusM, $categories, $limit),
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
            invoker: fn (PlaceSearchProviderInterface $p, ?string $q): ?PlaceResult => $p->geocode((string) $q),
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
            invoker: fn (PlaceSearchProviderInterface $p, ?string $q): ?PlaceResult => $p->reverseGeocode($lat, $lng),
        );
    }

    /**
     * @param  callable(PlaceSearchProviderInterface, ?string): list<PlaceSuggestion|PlaceResult>  $invoker
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
        $adequateFound = false;

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

        $consider = function (array $results, string $providerName) use (
            &$best, &$bestProvider, &$bestScore, &$fallbackDepth, &$adequateFound, &$tried, $operation, $query, $lat, $lng
        ): bool {
            $score = $this->scorer->score($results, $operation, $query, $lat, $lng);
            if ($score > $bestScore) {
                $best = $results;
                $bestScore = $score;
                $bestProvider = $providerName;
                $fallbackDepth = max(0, count($tried) - 1);
            }

            if ($this->scorer->isAdequateForProvider($results, $operation, $providerName, $query)) {
                $best = $results;
                $bestProvider = $providerName;
                $bestScore = $score;
                $fallbackDepth = max(0, count($tried) - 1);
                $adequateFound = true;

                return true;
            }

            return false;
        };

        // Cheap providers first (Geoapify → Foursquare). Query variants let the
        // waterfall retry with the brand "core" (descriptors like "Shopping"/"Mall"
        // stripped) when the verbatim phrasing finds nothing relevant — e.g.
        // "Jara Shopping Mall" → "Jara" surfaces Foursquare's "Jara Mall". Google is
        // deliberately excluded here so it stays a true last resort.
        foreach ($this->queryVariants($query, $operation) as $variant) {
            foreach ($this->orderedProviders($query, $operation) as $provider) {
                if ($provider->name() === 'google' || ! $provider->isConfigured()) {
                    continue;
                }

                if (! in_array($provider->name(), $tried, true)) {
                    $tried[] = $provider->name();
                }

                try {
                    $results = $invoker($provider, $variant);
                } catch (ProviderException $e) {
                    Log::info('places.provider_failed', [
                        'provider' => $e->provider,
                        'reason' => $e->reason,
                        'op' => $operation,
                    ]);
                    continue;
                }

                if ($results === []) {
                    continue;
                }

                if ($consider($results, $provider->name())) {
                    break;
                }
            }

            if ($adequateFound) {
                break;
            }
        }

        // Final resort: Google Places, invoked at most once with the verbatim query,
        // only after every cheaper provider/variant failed to satisfy the request.
        if (! $adequateFound && (bool) config('places.fallback_enabled', true)) {
            $google = $this->providerByName('google');
            if (
                $google !== null
                && $google->isConfigured()
                && ! $this->usage->googleBudgetExceeded()
            ) {
                if (! in_array('google', $tried, true)) {
                    $tried[] = 'google';
                }
                try {
                    $results = $invoker($google, $query);
                    if ($results !== []) {
                        $this->usage->recordGoogleCall();
                        $consider($results, 'google');
                    }
                } catch (ProviderException $e) {
                    Log::info('places.provider_failed', [
                        'provider' => $e->provider,
                        'reason' => $e->reason,
                        'op' => $operation,
                    ]);
                }
            }
        }

        // For brand/business queries, never surface a completely unrelated place
        // (e.g. a same-category venue in another country that only "scored" well).
        // An honest empty result beats a misleading one.
        if (
            ! $adequateFound
            && $bestProvider !== null
            && $query !== null
            && in_array($operation, ['autocomplete', 'search'], true)
            && $this->scorer->looksLikeBusinessQuery($query)
        ) {
            $tokens = $this->scorer->significantQueryTokens($query);
            if ($tokens !== [] && $this->scorer->bestNameRelevance($best, $tokens) <= 0.0) {
                $best = [];
                $bestProvider = null;
                $bestScore = 0.0;
                $fallbackDepth = max(0, count($tried) - 1);
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
     * @param  callable(PlaceSearchProviderInterface, ?string): (?PlaceResult)  $invoker
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
            invoker: function (PlaceSearchProviderInterface $p, ?string $q) use ($invoker): array {
                $one = $invoker($p, $q);

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

    /**
     * Query strings to try, in order. The verbatim query first, then — for brand
     * text searches — a "core" variant with generic descriptors stripped so the
     * waterfall can still locate the venue when a provider does not index the exact
     * phrasing (e.g. "Jara Shopping Mall" → "Jara").
     *
     * @return list<string|null>
     */
    private function queryVariants(?string $query, string $operation): array
    {
        if ($query === null || ! in_array($operation, ['autocomplete', 'search'], true)) {
            return [$query];
        }

        $variants = [$query];

        if ($this->scorer->looksLikeBusinessQuery($query)) {
            $core = implode(' ', $this->scorer->significantQueryTokens($query));
            if ($core !== '' && strtolower(trim($core)) !== strtolower(trim($query))) {
                $variants[] = $core;
            }
        }

        return $variants;
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
