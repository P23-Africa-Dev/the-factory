<?php

declare(strict_types=1);

namespace App\Services\Places;

use App\DTO\Places\PlaceResult;
use App\DTO\Places\PlaceSuggestion;
use Illuminate\Support\Str;

final class PlaceQualityScorer
{
    /**
     * Generic descriptor / filler words that carry no brand identity. Stripped
     * before deciding whether a provider's result NAMES actually match the query.
     *
     * @var list<string>
     */
    private const NAME_STOPWORDS = [
        'mall', 'malls', 'shopping', 'shop', 'shops', 'store', 'stores',
        'plaza', 'plazas', 'market', 'markets', 'supermarket', 'hypermarket',
        'mart', 'centre', 'center', 'complex', 'arcade', 'outlet', 'branch',
        'the', 'and', 'for',
    ];

    /**
     * Provider priority for tiebreaks (higher = preferred when scores equal).
     *
     * @var array<string, float>
     */
    private const PROVIDER_PRIORITY = [
        'foursquare' => 0.03,
        'geoapify' => 0.02,
        'google' => 0.01,
    ];

    /**
     * @param  list<PlaceSuggestion|PlaceResult>  $results
     */
    public function score(
        array $results,
        string $operation,
        ?string $query = null,
        ?float $biasLat = null,
        ?float $biasLng = null,
    ): float {
        if ($results === []) {
            return 0.0;
        }

        $minNearby = (int) config('places.min_nearby_results', 3);
        $minResults = (int) config('places.min_results', 1);

        if ($operation === 'nearby' && count($results) < $minNearby) {
            return min(0.5, count($results) / max(1, $minNearby));
        }

        if (count($results) < $minResults) {
            return 0.0;
        }

        $scores = [];
        foreach (array_slice($results, 0, 5) as $item) {
            $scores[] = $this->scoreOne($item, $query, $biasLat, $biasLng, $operation);
        }

        return round(array_sum($scores) / max(1, count($scores)), 4);
    }

    /**
     * Rank results for fan-out merge: name relevance + proximity + confidence + provider tiebreak.
     *
     * @param  list<PlaceSuggestion|PlaceResult>  $results
     * @return list<PlaceSuggestion|PlaceResult>
     */
    public function rank(
        array $results,
        ?string $query = null,
        ?float $biasLat = null,
        ?float $biasLng = null,
    ): array {
        if ($results === [] || count($results) === 1) {
            return $results;
        }

        $scored = [];
        foreach ($results as $index => $item) {
            $scored[] = [
                'item' => $item,
                'score' => $this->itemRelevance($item, $query, $biasLat, $biasLng),
                'index' => $index,
            ];
        }

        usort($scored, static function (array $a, array $b): int {
            if ($a['score'] === $b['score']) {
                return $a['index'] <=> $b['index'];
            }

            return $b['score'] <=> $a['score'];
        });

        return array_map(static fn (array $row) => $row['item'], $scored);
    }

    /**
     * Per-item relevance used for ordering and the Google backstop trigger.
     */
    public function itemRelevance(
        PlaceSuggestion|PlaceResult $item,
        ?string $query = null,
        ?float $biasLat = null,
        ?float $biasLng = null,
    ): float {
        $score = 0.0;

        $tokens = $query !== null && $query !== '' ? $this->significantQueryTokens($query) : [];
        if ($tokens !== []) {
            $score += 0.55 * $this->nameRelevanceForItem($item, $tokens);
        } else {
            $score += 0.2;
        }

        $lat = $item->latitude;
        $lng = $item->longitude;
        $hasCoords = $lat !== null && $lng !== null;

        // Prefer fly-to-ready suggestions so coord-less stubs rank below real POIs.
        if ($hasCoords) {
            $score += 0.06;
        }

        if ($biasLat !== null && $biasLng !== null && $hasCoords) {
            $km = $this->haversineKm($biasLat, $biasLng, $lat, $lng);
            if ($km <= 5) {
                $score += 0.25;
            } elseif ($km <= 25) {
                $score += 0.15;
            } elseif ($km <= 80) {
                $score += 0.05;
            }
            // Far-away foreign junk gets no proximity boost (and name gate usually sinks it).
        } elseif ($hasCoords) {
            $score += 0.05;
        }

        $confidence = $item->confidence;
        if ($confidence !== null) {
            $score += min(0.12, max(0.0, $confidence) * 0.12);
        } else {
            $score += 0.04;
        }

        $score += self::PROVIDER_PRIORITY[$item->provider] ?? 0.0;

        if (trim($item->formattedAddress) !== '') {
            $score += 0.03;
        }

        return round(min(1.0, $score), 4);
    }

    /**
     * Whether the merged fan-out set is too weak to skip Google.
     *
     * @param  list<PlaceSuggestion|PlaceResult>  $results
     */
    public function needsBackstop(
        array $results,
        ?string $query = null,
        ?float $biasLat = null,
        ?float $biasLng = null,
    ): bool {
        if ($results === []) {
            return true;
        }

        $floor = (float) config('places.fanout.backstop_relevance_floor', 0.5);
        $top = $this->itemRelevance($results[0], $query, $biasLat, $biasLng);

        if ($top + 1e-9 < $floor) {
            return true;
        }

        // Brand queries: require at least one name-relevant hit before skipping Google.
        if ($query !== null && $this->looksLikeBusinessQuery($query)) {
            $tokens = $this->significantQueryTokens($query);
            if ($tokens !== [] && $this->bestNameRelevance($results, $tokens) + 1e-9 < (count($tokens) === 1 ? 1.0 : 0.5)) {
                return true;
            }
        }

        return false;
    }

    public function passes(float $score, string $operation, ?string $query = null): bool
    {
        $threshold = (float) config('places.quality_threshold', 0.80);

        if ($query !== null && $this->looksLikeBusinessQuery($query) && $operation !== 'nearby') {
            $threshold = max(0.82, $threshold);
        }

        return $score >= $threshold;
    }

    /**
     * @param  list<PlaceSuggestion|PlaceResult>  $results
     */
    public function isAdequateForProvider(
        array $results,
        string $operation,
        string $provider,
        ?string $query = null,
    ): bool {
        if ($results === []) {
            return false;
        }

        $score = $this->score($results, $operation, $query);
        if (! $this->passes($score, $operation, $query)) {
            return false;
        }

        if (
            $query !== null
            && in_array($operation, ['autocomplete', 'search'], true)
            && $this->looksLikeBusinessQuery($query)
        ) {
            $tokens = $this->significantQueryTokens($query);

            if ($tokens !== []) {
                $relevance = $this->bestNameRelevance($results, $tokens);
                $required = count($tokens) === 1 ? 1.0 : 0.5;

                if ($relevance + 1e-9 < $required) {
                    return false;
                }
            }
        }

        return true;
    }

    /**
     * @return list<string>
     */
    public function significantQueryTokens(string $query): array
    {
        $tokens = preg_split('/[^a-z0-9]+/', $this->normalize($query), -1, PREG_SPLIT_NO_EMPTY) ?: [];

        $out = [];
        foreach ($tokens as $token) {
            if (strlen($token) < 3) {
                continue;
            }
            if (in_array($token, self::NAME_STOPWORDS, true)) {
                continue;
            }
            $out[] = $token;
        }

        return array_values(array_unique($out));
    }

    /**
     * @param  list<PlaceSuggestion|PlaceResult>  $results
     * @param  list<string>  $tokens
     */
    public function bestNameRelevance(array $results, array $tokens): float
    {
        if ($tokens === []) {
            return 1.0;
        }

        $best = 0.0;
        foreach (array_slice($results, 0, 5) as $item) {
            $relevance = $this->nameRelevanceForItem($item, $tokens);
            if ($relevance > $best) {
                $best = $relevance;
            }
        }

        return $best;
    }

    /**
     * @param  list<string>  $tokens
     */
    public function nameRelevanceForItem(PlaceSuggestion|PlaceResult $item, array $tokens): float
    {
        if ($tokens === []) {
            return 1.0;
        }

        $nameTokens = preg_split('/[^a-z0-9]+/', $this->normalize($item->name), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        if ($nameTokens === []) {
            return 0.0;
        }

        $matched = 0;
        foreach ($tokens as $qt) {
            foreach ($nameTokens as $nt) {
                if ($this->tokenMatches($qt, $nt)) {
                    $matched++;
                    break;
                }
            }
        }

        return $matched / count($tokens);
    }

    private function tokenMatches(string $queryToken, string $nameToken): bool
    {
        if ($queryToken === $nameToken) {
            return true;
        }

        if (strlen($queryToken) >= 6 && str_starts_with($nameToken, $queryToken) && strlen($nameToken) - strlen($queryToken) <= 1) {
            return true;
        }

        return false;
    }

    private function normalize(string $value): string
    {
        return strtolower(trim(Str::ascii($value)));
    }

    public function looksLikeBusinessQuery(string $query): bool
    {
        $q = strtolower(trim($query));
        if ($q === '') {
            return false;
        }

        if (preg_match('/\d+\s+\w+|street|st\.|road|rd\.|avenue|ave\.|lane|drive|boulevard|close|court/i', $q)) {
            return false;
        }

        return true;
    }

    private function scoreOne(
        PlaceSuggestion|PlaceResult $item,
        ?string $query,
        ?float $biasLat,
        ?float $biasLng,
        string $operation,
    ): float {
        $score = 0.0;

        $name = trim($item->name);
        $address = trim($item->formattedAddress);
        if ($name !== '') {
            $score += 0.25;
        }
        if ($address !== '') {
            $score += 0.2;
        }

        $lat = $item->latitude;
        $lng = $item->longitude;
        if ($lat !== null && $lng !== null && is_finite($lat) && is_finite($lng)) {
            $score += 0.2;
        } elseif ($operation === 'autocomplete') {
            $score += 0.1;
        }

        $confidence = $item->confidence;
        if ($confidence !== null) {
            $score += min(0.2, max(0.0, $confidence) * 0.2);
        } else {
            $score += 0.08;
        }

        if ($query !== null && $query !== '') {
            $q = strtolower($query);
            $hay = strtolower($name.' '.$address);
            if ($hay !== '' && str_contains($hay, $q)) {
                $score += 0.15;
            } else {
                $tokens = preg_split('/\s+/', $q) ?: [];
                $hits = 0;
                foreach ($tokens as $token) {
                    if (strlen($token) >= 3 && str_contains($hay, $token)) {
                        $hits++;
                    }
                }
                if ($tokens !== [] && $hits / count($tokens) >= 0.5) {
                    $score += 0.08;
                }
            }
        }

        if ($biasLat !== null && $biasLng !== null && $lat !== null && $lng !== null) {
            $km = $this->haversineKm($biasLat, $biasLng, $lat, $lng);
            if ($km <= 5) {
                $score += 0.1;
            } elseif ($km <= 25) {
                $score += 0.05;
            }
        }

        if ($item->categories !== []) {
            $score += 0.05;
        }

        return min(1.0, $score);
    }

    public function haversineKm(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $r = 6371.0;
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);
        $a = sin($dLat / 2) ** 2
            + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;

        return $r * 2 * atan2(sqrt($a), sqrt(1 - $a));
    }
}
