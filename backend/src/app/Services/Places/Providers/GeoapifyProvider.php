<?php

declare(strict_types=1);

namespace App\Services\Places\Providers;

use App\Contracts\Places\PlaceSearchProviderInterface;
use App\DTO\Places\PlaceResult;
use App\DTO\Places\PlaceSuggestion;
use App\Services\Places\Exceptions\ProviderException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

class GeoapifyProvider implements PlaceSearchProviderInterface
{
    public function name(): string
    {
        return 'geoapify';
    }

    public function isConfigured(): bool
    {
        if (! (bool) config('places.providers.geoapify.enabled', true)) {
            return false;
        }

        return trim((string) config('places.providers.geoapify.api_key')) !== '';
    }

    public function autocomplete(string $query, ?float $lat, ?float $lng, int $limit): array
    {
        $params = [
            'text' => $query,
            'apiKey' => $this->apiKey(),
            'limit' => max(1, min(10, $limit)),
            'format' => 'json',
        ];
        if ($lat !== null && $lng !== null) {
            $params['bias'] = "proximity:{$lng},{$lat}";
        }

        // Business-like queries: prefer amenity/POI matches over street addresses.
        if ($this->looksLikeBusinessQuery($query)) {
            $params['type'] = 'amenity';
        }

        $payload = $this->get('/v1/geocode/autocomplete', $params);
        $results = [];
        foreach ($payload['results'] ?? [] as $row) {
            if (! is_array($row)) {
                continue;
            }
            $suggestion = $this->mapSuggestion($row);
            if ($suggestion !== null) {
                $results[] = $suggestion;
            }
        }

        // If amenity filter returned nothing, retry without type restriction.
        if ($results === [] && isset($params['type'])) {
            unset($params['type']);
            $payload = $this->get('/v1/geocode/autocomplete', $params);
            foreach ($payload['results'] ?? [] as $row) {
                if (! is_array($row)) {
                    continue;
                }
                $suggestion = $this->mapSuggestion($row);
                if ($suggestion !== null) {
                    $results[] = $suggestion;
                }
            }
        }

        return $results;
    }

    public function search(string $query, ?float $lat, ?float $lng, int $limit): array
    {
        $params = [
            'text' => $query,
            'apiKey' => $this->apiKey(),
            'limit' => max(1, min(20, $limit)),
            'format' => 'json',
        ];
        if ($lat !== null && $lng !== null) {
            $params['bias'] = "proximity:{$lng},{$lat}";
        }

        $payload = $this->get('/v1/geocode/search', $params);
        $results = [];
        foreach ($payload['results'] ?? [] as $row) {
            if (! is_array($row)) {
                continue;
            }
            $place = $this->mapResult($row);
            if ($place !== null) {
                $results[] = $place;
            }
        }

        return $results;
    }

    public function nearby(float $lat, float $lng, int $radiusM, ?array $categories, int $limit): array
    {
        $cats = $categories !== null && $categories !== []
            ? implode(',', $categories)
            : 'commercial,catering,service,healthcare,accommodation';

        $payload = $this->get('/v2/places', [
            'categories' => $cats,
            'filter' => sprintf('circle:%F,%F,%d', $lng, $lat, max(100, min(5000, $radiusM))),
            'limit' => max(1, min(40, $limit)),
            'apiKey' => $this->apiKey(),
        ]);

        $results = [];
        foreach ($payload['features'] ?? [] as $feature) {
            if (! is_array($feature)) {
                continue;
            }
            $props = is_array($feature['properties'] ?? null) ? $feature['properties'] : [];
            $geometry = is_array($feature['geometry'] ?? null) ? $feature['geometry'] : [];
            $coords = is_array($geometry['coordinates'] ?? null) ? $geometry['coordinates'] : null;
            if (! is_array($coords) || count($coords) < 2) {
                continue;
            }

            $name = trim((string) ($props['name'] ?? $props['address_line1'] ?? 'Place'));
            $address = trim((string) ($props['formatted'] ?? $props['address_line2'] ?? ''));
            $id = (string) ($props['place_id'] ?? $props['datasource']['raw']['osm_id'] ?? uniqid('geo_', true));

            $results[] = new PlaceResult(
                id: $id,
                name: $name !== '' ? $name : 'Place',
                formattedAddress: $address,
                latitude: (float) $coords[1],
                longitude: (float) $coords[0],
                provider: $this->name(),
                confidence: 0.75,
                categories: isset($props['categories']) && is_array($props['categories'])
                    ? array_values(array_map('strval', $props['categories']))
                    : [],
                rawMeta: $props,
            );
        }

        return $results;
    }

    public function details(string $id): ?PlaceResult
    {
        // Geoapify place details via place_id on geocode reverse-like endpoint.
        $payload = $this->get('/v2/place-details', [
            'id' => $id,
            'apiKey' => $this->apiKey(),
        ]);

        $features = $payload['features'] ?? null;
        if (! is_array($features) || $features === []) {
            return null;
        }

        $feature = $features[0];
        if (! is_array($feature)) {
            return null;
        }

        $props = is_array($feature['properties'] ?? null) ? $feature['properties'] : [];
        $geometry = is_array($feature['geometry'] ?? null) ? $feature['geometry'] : [];

        // Prefer explicit lat/lon on properties — geometry may be a Polygon.
        $lat = isset($props['lat']) && is_numeric($props['lat']) ? (float) $props['lat'] : null;
        $lng = isset($props['lon']) && is_numeric($props['lon']) ? (float) $props['lon'] : null;
        if ($lat === null || $lng === null) {
            $coords = is_array($geometry['coordinates'] ?? null) ? $geometry['coordinates'] : null;
            if (is_array($coords) && isset($coords[0], $coords[1]) && is_numeric($coords[0]) && is_numeric($coords[1])) {
                $lng = (float) $coords[0];
                $lat = (float) $coords[1];
            }
        }
        if ($lat === null || $lng === null) {
            return null;
        }

        return new PlaceResult(
            id: $id,
            name: trim((string) ($props['name'] ?? 'Place')) ?: 'Place',
            formattedAddress: trim((string) ($props['formatted'] ?? '')),
            latitude: $lat,
            longitude: $lng,
            provider: $this->name(),
            confidence: 0.85,
            categories: isset($props['categories']) && is_array($props['categories'])
                ? array_values(array_map('strval', $props['categories']))
                : [],
            phone: isset($props['contact']['phone']) ? (string) $props['contact']['phone'] : null,
            website: isset($props['website']) ? (string) $props['website'] : null,
            rawMeta: $props,
        );
    }

    public function geocode(string $query): ?PlaceResult
    {
        $results = $this->search($query, null, null, 1);

        return $results[0] ?? null;
    }

    public function reverseGeocode(float $lat, float $lng): ?PlaceResult
    {
        $payload = $this->get('/v1/geocode/reverse', [
            'lat' => $lat,
            'lon' => $lng,
            'apiKey' => $this->apiKey(),
            'format' => 'json',
        ]);

        $row = $payload['results'][0] ?? null;
        if (! is_array($row)) {
            return null;
        }

        return $this->mapResult($row);
    }

    private function apiKey(): string
    {
        return trim((string) config('places.providers.geoapify.api_key'));
    }

    private function timeout(): float
    {
        return (float) config('places.timeouts.geoapify', 2.0);
    }

    /**
     * @param  array<string, mixed>  $params
     * @return array<string, mixed>
     */
    private function get(string $path, array $params): array
    {
        $base = rtrim((string) config('places.providers.geoapify.base_url'), '/');

        try {
            $response = Http::timeout($this->timeout())
                ->acceptJson()
                ->get($base.$path, $params);
        } catch (ConnectionException $e) {
            throw ProviderException::timeout($this->name());
        }

        if ($response->status() === 401 || $response->status() === 403) {
            throw ProviderException::auth($this->name());
        }
        if ($response->status() === 429) {
            throw ProviderException::rateLimited($this->name());
        }
        if (! $response->successful()) {
            throw ProviderException::unavailable($this->name(), 'HTTP '.$response->status());
        }

        $json = $response->json();
        if (! is_array($json)) {
            throw ProviderException::malformed($this->name());
        }

        return $json;
    }

    /**
     * @param  array<string, mixed>  $row
     */
    private function mapSuggestion(array $row): ?PlaceSuggestion
    {
        $name = trim((string) ($row['name'] ?? $row['address_line1'] ?? $row['formatted'] ?? ''));
        $formatted = trim((string) ($row['formatted'] ?? $row['address_line2'] ?? $name));
        $id = (string) ($row['place_id'] ?? $row['datasource']['raw']['osm_id'] ?? '');
        if ($id === '') {
            return null;
        }
        if ($name === '') {
            $name = $formatted !== '' ? $formatted : 'Place';
        }

        $lat = isset($row['lat']) && is_numeric($row['lat']) ? (float) $row['lat'] : null;
        $lng = isset($row['lon']) && is_numeric($row['lon']) ? (float) $row['lon'] : null;
        $rank = is_array($row['rank'] ?? null) ? $row['rank'] : [];
        $confidence = isset($rank['confidence']) && is_numeric($rank['confidence'])
            ? (float) $rank['confidence']
            : 0.7;

        return new PlaceSuggestion(
            id: $id,
            name: $name,
            formattedAddress: $formatted !== '' ? $formatted : $name,
            provider: $this->name(),
            latitude: $lat,
            longitude: $lng,
            confidence: $confidence,
            categories: isset($row['category']) ? [(string) $row['category']] : [],
            rawMeta: $row,
        );
    }

    private function looksLikeBusinessQuery(string $query): bool
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

    /**
     * @param  array<string, mixed>  $row
     */
    private function mapResult(array $row): ?PlaceResult
    {
        $lat = isset($row['lat']) && is_numeric($row['lat']) ? (float) $row['lat'] : null;
        $lng = isset($row['lon']) && is_numeric($row['lon']) ? (float) $row['lon'] : null;
        if ($lat === null || $lng === null) {
            return null;
        }

        $name = trim((string) ($row['name'] ?? $row['address_line1'] ?? $row['formatted'] ?? 'Location'));
        $formatted = trim((string) ($row['formatted'] ?? $name));
        $id = (string) ($row['place_id'] ?? uniqid('geo_', true));
        $rank = is_array($row['rank'] ?? null) ? $row['rank'] : [];
        $confidence = isset($rank['confidence']) && is_numeric($rank['confidence'])
            ? (float) $rank['confidence']
            : 0.75;

        $bbox = null;
        if (isset($row['bbox']) && is_array($row['bbox'])) {
            $b = $row['bbox'];
            if (isset($b['lon1'], $b['lat1'], $b['lon2'], $b['lat2'])) {
                $bbox = [(float) $b['lon1'], (float) $b['lat1'], (float) $b['lon2'], (float) $b['lat2']];
            } elseif (isset($b[0], $b[1], $b[2], $b[3])) {
                $bbox = [(float) $b[0], (float) $b[1], (float) $b[2], (float) $b[3]];
            }
        }

        return new PlaceResult(
            id: $id,
            name: $name !== '' ? $name : 'Location',
            formattedAddress: $formatted,
            latitude: $lat,
            longitude: $lng,
            provider: $this->name(),
            confidence: $confidence,
            categories: isset($row['category']) ? [(string) $row['category']] : [],
            bbox: $bbox,
            rawMeta: $row,
        );
    }
}
