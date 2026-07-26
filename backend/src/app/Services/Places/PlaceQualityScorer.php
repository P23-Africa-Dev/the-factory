<?php

declare(strict_types=1);

namespace App\Services\Places;

use App\DTO\Places\PlaceResult;
use App\DTO\Places\PlaceSuggestion;

final class PlaceQualityScorer
{
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

        // Business-intent queries can accept a slightly lower Geoapify score so
        // Foursquare is reached when commercial POI data is weak.
        if ($query !== null && $this->looksLikeBusinessQuery($query) && $operation !== 'nearby') {
            $threshold = max(0.55, $threshold - 0.15);
        }

        return $score >= $threshold;
    }

    public function looksLikeBusinessQuery(string $query): bool
    {
        $q = strtolower(trim($query));
        if ($q === '') {
            return false;
        }

        // Address-like → not a business-primary query.
        if (preg_match('/\d+|street|st\.|road|rd\.|avenue|ave\.|lane|drive|boulevard|close|court/i', $q)) {
            return false;
        }

        return (bool) preg_match(
            '/restaurant|cafe|hotel|bank|mall|shop|store|pharmacy|hospital|bar|club|gym|market/i',
            $q
        ) || ! preg_match('/\s/', $q);
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
