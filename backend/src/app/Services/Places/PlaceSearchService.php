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
use Illuminate\Http\Client\Pool;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

final class PlaceSearchService
{
    /** @var list<PlaceSearchProviderInterface> */
    private array $providers;

    private ?float $fanoutBiasLat = null;

    private ?float $fanoutBiasLng = null;

    private int $fanoutLimit = 6;

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

        $fanoutOps = in_array($operation, ['autocomplete', 'search'], true)
            && (bool) config('places.fanout.enabled', true);

        if ($fanoutOps) {
            $bundle = $this->runFanout($operation, $query, $lat, $lng, $limit, $invoker);
        } else {
            $bundle = $this->runSequentialWaterfall($operation, $query, $lat, $lng, $invoker);
        }

        $results = array_slice($bundle['results'], 0, max(1, $limit));
        $bestProvider = $bundle['providerFinal'];
        $tried = $bundle['providersTried'];
        $fallbackDepth = $bundle['fallbackDepth'];
        $bestScore = $bundle['confidence'];
        $creditsMeta = null;

        if ($bestProvider !== null && $results !== []) {
            $chargeProvider = (bool) config('places.fanout.charge_sku_once', true)
                ? $bestProvider
                : $bestProvider;
            $gate = $this->chargeIfNeeded($company, $sku, $chargeProvider, $source);
            if ($gate['blocked']) {
                return $this->emptyBlocked($started, $gate['credits']);
            }
            $creditsMeta = $gate['credits'];
        }

        $latencyMs = (int) ((hrtime(true) - $started) / 1_000_000);
        $outcome = new PlaceSearchOutcome(
            results: $results,
            providerFinal: $bestProvider,
            providersTried: $tried,
            cacheHit: false,
            fallbackDepth: $fallbackDepth,
            confidence: $bestScore,
            latencyMs: $latencyMs,
            credits: $creditsMeta,
            status: $results === [] ? 'empty' : 'ok',
        );

        if ($results !== []) {
            $this->cache->put($operation, $cacheKey, $outcome->toApiEnvelope());
        }

        $this->logEvent($outcome, $sku, $company, $user, $source, $ip, $query);

        return $outcome;
    }

    /**
     * Parallel fan-out: Geoapify + Foursquare concurrently, merge/dedupe/rank,
     * then Google only when the merged set is empty or weak.
     *
     * @param  callable(PlaceSearchProviderInterface, ?string): list<PlaceSuggestion|PlaceResult>  $invoker
     * @return array{
     *   results: list<PlaceSuggestion|PlaceResult>,
     *   providerFinal: ?string,
     *   providersTried: list<string>,
     *   fallbackDepth: int,
     *   confidence: float
     * }
     */
    private function runFanout(
        string $operation,
        ?string $query,
        ?float $lat,
        ?float $lng,
        int $limit,
        callable $invoker,
    ): array {
        $fanoutNames = config('places.fanout.providers', ['geoapify', 'foursquare']);
        if (! is_array($fanoutNames)) {
            $fanoutNames = ['geoapify', 'foursquare'];
        }
        $fanoutNames = array_values(array_filter(array_map('strval', $fanoutNames)));

        $this->fanoutBiasLat = $lat;
        $this->fanoutBiasLng = $lng;
        $this->fanoutLimit = max(1, $limit);

        $tried = [];
        $merged = [];

        // Pass 1: verbatim query across fan-out providers (parallel when possible).
        $pass = $this->invokeProviders($fanoutNames, $query, $invoker, $operation);
        $tried = array_values(array_unique(array_merge($tried, $pass['tried'])));
        $merged = $this->mergeResults($merged, $pass['results']);

        $ranked = $this->scorer->rank($merged, $query, $lat, $lng);

        // Pass 2 (settled/weak only): brand-core relaxation — e.g. "Jara Shopping Mall" → "jara".
        if (
            $query !== null
            && $this->scorer->needsBackstop($ranked, $query, $lat, $lng)
        ) {
            $core = implode(' ', $this->scorer->significantQueryTokens($query));
            if ($core !== '' && strtolower(trim($core)) !== strtolower(trim($query))) {
                $pass2 = $this->invokeProviders($fanoutNames, $core, $invoker, $operation);
                $tried = array_values(array_unique(array_merge($tried, $pass2['tried'])));
                $merged = $this->mergeResults($merged, $pass2['results']);
                $ranked = $this->scorer->rank($merged, $query, $lat, $lng);
            }
        }

        // Pass 3: Google backstop when still empty/weak.
        if (
            $this->scorer->needsBackstop($ranked, $query, $lat, $lng)
            && (bool) config('places.fallback_enabled', true)
        ) {
            $backstop = (string) config('places.fanout.backstop_provider', 'google');
            $google = $this->providerByName($backstop);
            if (
                $google !== null
                && $google->isConfigured()
                && ! $this->usage->googleBudgetExceeded()
            ) {
                if (! in_array($google->name(), $tried, true)) {
                    $tried[] = $google->name();
                }
                try {
                    $gResults = $invoker($google, $query);
                    if ($gResults !== []) {
                        $this->usage->recordGoogleCall();
                        $merged = $this->mergeResults($merged, $gResults);
                        $ranked = $this->scorer->rank($merged, $query, $lat, $lng);
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

        // Soft filter: drop clearly-irrelevant foreign junk when we already have
        // stronger local/name-matching hits. Never zero-out the whole list.
        $ranked = $this->softFilterIrrelevant($ranked, $query, $lat, $lng);

        $providerFinal = $ranked[0]->provider ?? null;
        $confidence = $ranked !== []
            ? $this->scorer->itemRelevance($ranked[0], $query, $lat, $lng)
            : 0.0;

        return [
            'results' => $ranked,
            'providerFinal' => $providerFinal,
            'providersTried' => $tried,
            'fallbackDepth' => max(0, count($tried) - 1),
            'confidence' => $confidence,
        ];
    }

    /**
     * Cheap-first sequential path for nearby / geocode / reverse (no hard empty-suppression).
     *
     * @param  callable(PlaceSearchProviderInterface, ?string): list<PlaceSuggestion|PlaceResult>  $invoker
     * @return array{
     *   results: list<PlaceSuggestion|PlaceResult>,
     *   providerFinal: ?string,
     *   providersTried: list<string>,
     *   fallbackDepth: int,
     *   confidence: float
     * }
     */
    private function runSequentialWaterfall(
        string $operation,
        ?string $query,
        ?float $lat,
        ?float $lng,
        callable $invoker,
    ): array {
        $tried = [];
        $best = [];
        $bestProvider = null;
        $bestScore = 0.0;

        foreach ($this->providers as $provider) {
            if (! $provider->isConfigured()) {
                continue;
            }
            if ($provider->name() === 'google') {
                if (! (bool) config('places.fallback_enabled', true)) {
                    continue;
                }
                if ($this->usage->googleBudgetExceeded()) {
                    continue;
                }
            }

            $tried[] = $provider->name();
            try {
                $results = $invoker($provider, $query);
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

            if ($provider->name() === 'google') {
                $this->usage->recordGoogleCall();
            }

            $score = $this->scorer->score($results, $operation, $query, $lat, $lng);
            if ($score > $bestScore) {
                $best = $results;
                $bestScore = $score;
                $bestProvider = $provider->name();
            }

            if ($this->scorer->isAdequateForProvider($results, $operation, $provider->name(), $query)) {
                $best = $results;
                $bestProvider = $provider->name();
                $bestScore = $score;
                break;
            }
        }

        return [
            'results' => $best,
            'providerFinal' => $bestProvider,
            'providersTried' => $tried,
            'fallbackDepth' => max(0, count($tried) - 1),
            'confidence' => $bestScore,
        ];
    }

    /**
     * @param  list<string>  $providerNames
     * @param  callable(PlaceSearchProviderInterface, ?string): list<PlaceSuggestion|PlaceResult>  $invoker
     * @return array{results: list<PlaceSuggestion|PlaceResult>, tried: list<string>}
     */
    private function invokeProviders(
        array $providerNames,
        ?string $query,
        callable $invoker,
        string $operation,
    ): array {
        $configured = [];
        foreach ($providerNames as $name) {
            $provider = $this->providerByName($name);
            if ($provider !== null && $provider->isConfigured()) {
                $configured[] = $provider;
            }
        }

        if ($configured === []) {
            return ['results' => [], 'tried' => []];
        }

        $tried = array_map(static fn (PlaceSearchProviderInterface $p): string => $p->name(), $configured);
        $results = [];

        // True concurrent HTTP via Http::pool (no process-fork tax from Concurrency::run).
        // Unit tests keep sequential mocks in the parent process.
        $canPool = ! app()->runningUnitTests()
            && in_array($operation, ['autocomplete', 'search'], true)
            && count($configured) > 1
            && $query !== null
            && $this->providersSupportHttpPool($configured);

        if ($canPool) {
            try {
                $pooled = $this->invokeProvidersHttpPool($configured, $query, $operation);
                if ($pooled !== null) {
                    return ['results' => $pooled, 'tried' => $tried];
                }
            } catch (\Throwable $e) {
                Log::info('places.fanout_pool_fallback', [
                    'op' => $operation,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        foreach ($configured as $provider) {
            try {
                $chunk = $invoker($provider, $query);
                if ($chunk === []) {
                    Log::info('places.fanout_empty_chunk', [
                        'provider' => $provider->name(),
                        'op' => $operation,
                        'query_len' => $query !== null ? mb_strlen($query) : 0,
                    ]);
                }
                foreach ($chunk as $item) {
                    $results[] = $item;
                }
            } catch (ProviderException $e) {
                Log::info('places.provider_failed', [
                    'provider' => $e->provider,
                    'reason' => $e->reason,
                    'op' => $operation,
                ]);
            }
        }

        return ['results' => $results, 'tried' => $tried];
    }

    /**
     * @param  list<PlaceSearchProviderInterface>  $providers
     */
    private function providersSupportHttpPool(array $providers): bool
    {
        foreach ($providers as $provider) {
            if (! ($provider instanceof GeoapifyProvider || $provider instanceof FoursquareProvider)) {
                return false;
            }
        }

        return true;
    }

    /**
     * @param  list<PlaceSearchProviderInterface>  $providers
     * @return list<PlaceSuggestion|PlaceResult>|null
     */
    private function invokeProvidersHttpPool(
        array $providers,
        string $query,
        string $operation,
    ): ?array {
        $lat = $this->fanoutBiasLat;
        $lng = $this->fanoutBiasLng;
        $limit = $this->fanoutLimit;

        $geo = null;
        $fsq = null;
        foreach ($providers as $provider) {
            if ($provider instanceof GeoapifyProvider) {
                $geo = $provider;
            }
            if ($provider instanceof FoursquareProvider) {
                $fsq = $provider;
            }
        }

        if ($geo === null && $fsq === null) {
            return null;
        }

        $responses = Http::pool(function (Pool $pool) use ($geo, $fsq, $query, $lat, $lng, $limit, $operation): void {
            if ($geo !== null) {
                if ($operation === 'search') {
                    $geo->queueSearch($pool, $query, $lat, $lng, $limit);
                } else {
                    $geo->queueAutocomplete($pool, $query, $lat, $lng, $limit);
                }
            }
            if ($fsq !== null) {
                if ($operation === 'search') {
                    $fsq->queueSearch($pool, $query, $lat, $lng, $limit);
                } else {
                    $fsq->queueAutocomplete($pool, $query, $lat, $lng, $limit);
                }
            }
        });

        $results = [];
        if ($geo !== null) {
            $geoResponse = $responses['geoapify'] ?? null;
            $chunk = $geo->parsePooledList(
                $geoResponse instanceof Response ? $geoResponse : null,
                $operation,
                $query,
                $lat,
                $lng,
                $limit,
            );
            if ($chunk === []) {
                Log::info('places.fanout_empty_chunk', [
                    'provider' => 'geoapify',
                    'op' => $operation,
                    'query_len' => mb_strlen($query),
                ]);
            }
            foreach ($chunk as $item) {
                $results[] = $item;
            }
        }
        if ($fsq !== null) {
            $fsqResponse = $responses['foursquare'] ?? null;
            $chunk = $fsq->parsePooledList(
                $fsqResponse instanceof Response ? $fsqResponse : null,
                $operation,
                $query,
                $lat,
                $lng,
                $limit,
            );
            if ($chunk === []) {
                Log::info('places.fanout_empty_chunk', [
                    'provider' => 'foursquare',
                    'op' => $operation,
                    'query_len' => mb_strlen($query),
                ]);
            }
            foreach ($chunk as $item) {
                $results[] = $item;
            }
        }

        return $results;
    }

    /**
     * @param  list<PlaceSuggestion|PlaceResult>  $existing
     * @param  list<PlaceSuggestion|PlaceResult>  $incoming
     * @return list<PlaceSuggestion|PlaceResult>
     */
    private function mergeResults(array $existing, array $incoming): array
    {
        $out = $existing;
        foreach ($incoming as $item) {
            $index = $this->findDuplicateIndex($out, $item);
            if ($index === null) {
                $out[] = $item;
                continue;
            }
            // Never drop a coord-bearing POI in favor of a name-only stub.
            $out[$index] = $this->preferPlace($out[$index], $item);
        }

        return array_values($out);
    }

    /**
     * @param  list<PlaceSuggestion|PlaceResult>  $existing
     */
    private function findDuplicateIndex(array $existing, PlaceSuggestion|PlaceResult $candidate): ?int
    {
        $dedupeM = (int) config('places.fanout.dedupe_meters', 150);
        $candName = $this->normalizeName($candidate->name);
        $candLat = $candidate->latitude;
        $candLng = $candidate->longitude;
        $candHasCoords = $candLat !== null && $candLng !== null;

        foreach ($existing as $index => $item) {
            if ($item->provider === $candidate->provider && $item->id !== '' && $item->id === $candidate->id) {
                return $index;
            }

            $sameName = $candName !== '' && $this->normalizeName($item->name) === $candName;
            if (! $sameName) {
                continue;
            }

            $lat = $item->latitude;
            $lng = $item->longitude;
            $itemHasCoords = $lat !== null && $lng !== null;

            if ($itemHasCoords && $candHasCoords) {
                $meters = $this->scorer->haversineKm($lat, $lng, $candLat, $candLng) * 1000.0;
                if ($meters <= $dedupeM) {
                    return $index;
                }

                continue;
            }

            // Same name and at least one side lacks coords — treat as the same place
            // so preferPlace() can keep the coord-bearing candidate.
            return $index;
        }

        return null;
    }

    private function preferPlace(
        PlaceSuggestion|PlaceResult $a,
        PlaceSuggestion|PlaceResult $b,
    ): PlaceSuggestion|PlaceResult {
        $aCoords = $a->latitude !== null && $a->longitude !== null;
        $bCoords = $b->latitude !== null && $b->longitude !== null;

        if ($bCoords && ! $aCoords) {
            return $b;
        }
        if ($aCoords && ! $bCoords) {
            return $a;
        }

        $priority = [
            'foursquare' => 3,
            'google' => 2,
            'geoapify' => 1,
        ];
        $ap = $priority[$a->provider] ?? 0;
        $bp = $priority[$b->provider] ?? 0;
        if ($bp !== $ap) {
            return $bp > $ap ? $b : $a;
        }

        $ac = $a->confidence ?? 0.0;
        $bc = $b->confidence ?? 0.0;

        return $bc > $ac ? $b : $a;
    }

    /**
     * Drop clearly-irrelevant items when stronger matches already exist.
     * Never returns an empty list if the input was non-empty.
     *
     * @param  list<PlaceSuggestion|PlaceResult>  $ranked
     * @return list<PlaceSuggestion|PlaceResult>
     */
    private function softFilterIrrelevant(
        array $ranked,
        ?string $query,
        ?float $biasLat,
        ?float $biasLng,
    ): array {
        if ($ranked === [] || $query === null || ! $this->scorer->looksLikeBusinessQuery($query)) {
            return $ranked;
        }

        $tokens = $this->scorer->significantQueryTokens($query);
        if ($tokens === []) {
            return $ranked;
        }

        $kept = [];
        foreach ($ranked as $item) {
            $nameRel = $this->scorer->nameRelevanceForItem($item, $tokens);
            $itemScore = $this->scorer->itemRelevance($item, $query, $biasLat, $biasLng);

            // Keep name matches and anything that still scores reasonably with proximity.
            if ($nameRel > 0.0 || $itemScore >= 0.35) {
                $kept[] = $item;
            }
        }

        return $kept !== [] ? $kept : $ranked;
    }

    private function normalizeName(string $name): string
    {
        return strtolower(trim(Str::ascii($name)));
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

        // Single charge per settled search: use a blended/primary unit cost, not per-provider sum.
        $units = (float) config("places.providers.{$provider}.credit_units", 1.0);
        if ((bool) config('places.fanout.charge_sku_once', true)) {
            $units = (float) config('places.providers.geoapify.credit_units', 1.0);
        }

        $result = $this->mapCredits->consume(
            company: $company,
            sku: $sku,
            source: $source,
            units: $units,
            meta: [
                'provider' => $provider,
                'operation' => $sku,
                'fanout' => true,
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
        $estimated = 0.0;
        if (! $outcome->cacheHit) {
            $op = str_replace('places.', '', $sku);
            foreach ($outcome->providersTried as $triedProvider) {
                $estimated += (float) config("places.cost_estimates_usd.{$triedProvider}.{$op}", 0);
            }
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
