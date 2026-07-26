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

    public function passes(float $score, string $operation, ?string $query = null): bool
    {
        $threshold = (float) config('places.quality_threshold', 0.80);

        // Business-intent queries need stronger adequacy before we skip Foursquare/Google.
        // A single weak Geoapify amenity hit should not block the commercial waterfall.
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

        // Name-relevance gate for brand/business text queries.
        //
        // Geocoders (Geoapify especially) happily return same-category places in the
        // wrong city or country with high confidence — e.g. "Jaraguá Mall, Brazil" for
        // a "Jara Mall" search, or a random street for "Shoprite". Those score well but
        // are useless, so the waterfall must fall through to the POI providers
        // (Foursquare/Google) which index named venues. A provider is only "adequate"
        // for a brand query when at least one of its top results is actually NAMED after
        // what the user typed.
        if (
            $query !== null
            && in_array($operation, ['autocomplete', 'search'], true)
            && $this->looksLikeBusinessQuery($query)
        ) {
            $tokens = $this->significantQueryTokens($query);

            if ($tokens !== []) {
                $relevance = $this->bestNameRelevance($results, $tokens);
                // Single-token brands ("Shoprite", "Jara") must match exactly; multi-token
                // queries only need half their meaningful tokens present in a result name.
                $required = count($tokens) === 1 ? 1.0 : 0.5;

                if ($relevance + 1e-9 < $required) {
                    return false;
                }
            }
        }

        return true;
    }

    /**
     * Meaningful (brand-carrying) tokens from a query, with accents folded and
     * generic descriptors ("mall", "shopping", ...) removed.
     *
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
     * Highest fraction of the query's meaningful tokens that appear in any single
     * result NAME (top 5 considered). Matching is strict whole-word (accent-folded):
     * "Jara" does NOT match "Jaraguá", "Jarak" or "Jarahueca". Longer brand tokens
     * (6+ chars) get a one-character plural/typo allowance so "Shoprite" still matches
     * "Shoprites" without opening short tokens up to false positives.
     *
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
            $nameTokens = preg_split('/[^a-z0-9]+/', $this->normalize($item->name), -1, PREG_SPLIT_NO_EMPTY) ?: [];
            if ($nameTokens === []) {
                continue;
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

            $relevance = $matched / count($tokens);
            if ($relevance > $best) {
                $best = $relevance;
            }
        }

        return $best;
    }

    private function tokenMatches(string $queryToken, string $nameToken): bool
    {
        if ($queryToken === $nameToken) {
            return true;
        }

        // Plural/typo tolerance only for longer, distinctive brand tokens.
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

        // Address-like → not a business-primary query.
        if (preg_match('/\d+\s+\w+|street|st\.|road|rd\.|avenue|ave\.|lane|drive|boulevard|close|court/i', $q)) {
            return false;
        }

        // Non-address free-text (brand names, venues, neighborhoods-as-POI) use the
        // commercial waterfall so thin Geoapify hits still reach Foursquare/Google.
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

        $lat = $item instanceof PlaceResult ? $item->latitude : $item->latitude;
        $lng = $item instanceof PlaceResult ? $item->longitude : $item->longitude;
        if ($lat !== null && $lng !== null && is_finite($lat) && is_finite($lng)) {
            $score += 0.2;
        } elseif ($operation === 'autocomplete') {
            // Autocomplete often lacks coords until details — still usable.
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

    private function haversineKm(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $r = 6371.0;
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);
        $a = sin($dLat / 2) ** 2
            + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;

        return $r * 2 * atan2(sqrt($a), sqrt(1 - $a));
    }
}
