<?php

declare(strict_types=1);

namespace App\Services\Places\Providers;

use App\Contracts\Places\PlaceSearchProviderInterface;
use App\DTO\Places\PlaceResult;
use App\DTO\Places\PlaceSuggestion;
use App\Services\Places\Exceptions\ProviderException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Pool;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class FoursquareProvider implements PlaceSearchProviderInterface
{
    public function name(): string
    {
        return 'foursquare';
    }

    public function isConfigured(): bool
    {
        if (! (bool) config('places.providers.foursquare.enabled', true)) {
            return false;
        }

        return trim((string) config('places.providers.foursquare.api_key')) !== '';
    }

    public function autocomplete(string $query, ?float $lat, ?float $lng, int $limit): array
    {
        $params = [
            'query' => $query,
            'limit' => max(1, min(15, $limit)),
            'types' => 'place',
        ];
        if ($lat !== null && $lng !== null) {
            $params['ll'] = "{$lat},{$lng}";
        }

        $payload = $this->get('/autocomplete', $params);
        $results = [];
        foreach ($payload['results'] ?? [] as $row) {
            if (! is_array($row)) {
                continue;
            }
            $place = is_array($row['place'] ?? null) ? $row['place'] : $row;
            $suggestion = $this->mapSuggestion($place, is_array($row['text'] ?? null) ? $row['text'] : []);
            if ($suggestion !== null) {
                $results[] = $suggestion;
            }
        }

        return $results;
    }

    public function queueAutocomplete(Pool $pool, string $query, ?float $lat, ?float $lng, int $limit): void
    {
        $params = [
            'query' => $query,
            'limit' => max(1, min(15, $limit)),
            'types' => 'place',
        ];
        if ($lat !== null && $lng !== null) {
            $params['ll'] = "{$lat},{$lng}";
        }
        $pool->as($this->name())
            ->timeout($this->timeout())
            ->withHeaders($this->authHeaders())
            ->get($this->baseUrl().'/autocomplete', $params);
    }

    public function queueSearch(Pool $pool, string $query, ?float $lat, ?float $lng, int $limit): void
    {
        $params = [
            'query' => $query,
            'limit' => max(1, min(20, $limit)),
        ];
        if ($lat !== null && $lng !== null) {
            $params['ll'] = "{$lat},{$lng}";
        }
        if ($this->premiumFieldsEnabled()) {
            $params['fields'] = $this->premiumFieldList();
        }
        $pool->as($this->name())
            ->timeout($this->timeout())
            ->withHeaders($this->authHeaders())
            ->get($this->baseUrl().'/places/search', $params);
    }

    /**
     * @return list<PlaceSuggestion|PlaceResult>
     */
    public function parsePooledList(
        ?Response $response,
        string $operation,
        string $query,
        ?float $lat,
        ?float $lng,
        int $limit,
    ): array {
        unset($query, $lat, $lng, $limit);

        if ($response === null || $response instanceof \Throwable || ! $response->successful()) {
            return [];
        }

        $json = $response->json();
        if (! is_array($json)) {
            return [];
        }

        if ($operation === 'search') {
            return $this->mapPlaces($json['results'] ?? []);
        }

        $results = [];
        foreach ($json['results'] ?? [] as $row) {
            if (! is_array($row)) {
                continue;
            }
            $place = is_array($row['place'] ?? null) ? $row['place'] : $row;
            $suggestion = $this->mapSuggestion($place, is_array($row['text'] ?? null) ? $row['text'] : []);
            if ($suggestion !== null) {
                $results[] = $suggestion;
            }
        }

        return $results;
    }

    public function search(string $query, ?float $lat, ?float $lng, int $limit): array
    {
        $params = [
            'query' => $query,
            'limit' => max(1, min(20, $limit)),
        ];
        if ($lat !== null && $lng !== null) {
            $params['ll'] = "{$lat},{$lng}";
        }
        if ($this->premiumFieldsEnabled()) {
            $params['fields'] = $this->premiumFieldList();
        }

        $payload = $this->get('/places/search', $params);

        return $this->mapPlaces($payload['results'] ?? []);
    }

    public function nearby(float $lat, float $lng, int $radiusM, ?array $categories, int $limit): array
    {
        $params = [
            'll' => "{$lat},{$lng}",
            'radius' => max(100, min(5000, $radiusM)),
            'limit' => max(1, min(40, $limit)),
        ];
        if ($categories !== null && $categories !== []) {
            $params['categories'] = implode(',', $categories);
        }
        if ($this->premiumFieldsEnabled()) {
            $params['fields'] = $this->premiumFieldList();
        }

        $payload = $this->get('/places/search', $params);

        return $this->mapPlaces($payload['results'] ?? []);
    }

    public function details(string $id): ?PlaceResult
    {
        $params = [];
        if ($this->premiumFieldsEnabled()) {
            $params['fields'] = $this->premiumFieldList();
        }
        $payload = $this->get('/places/'.$id, $params);
        if ($payload === []) {
            return null;
        }

        $mapped = $this->mapPlaces([$payload]);

        return $mapped[0] ?? null;
    }

    public function geocode(string $query): ?PlaceResult
    {
        $results = $this->search($query, null, null, 1);

        return $results[0] ?? null;
    }

    public function reverseGeocode(float $lat, float $lng): ?PlaceResult
    {
        $results = $this->nearby($lat, $lng, 200, null, 1);

        return $results[0] ?? null;
    }

    private function apiKey(): string
    {
        $key = trim((string) config('places.providers.foursquare.api_key'));

        return Str::startsWith($key, 'Bearer ') ? substr($key, 7) : $key;
    }

    private function timeout(): float
    {
        return (float) config('places.timeouts.foursquare', 2.5);
    }

    private function apiVersion(): string
    {
        return (string) config('places.providers.foursquare.api_version', '2025-06-17');
    }

    /**
     * @return array<string, string>
     */
    private function authHeaders(): array
    {
        return [
            'Authorization' => 'Bearer '.$this->apiKey(),
            'Accept' => 'application/json',
            'X-Places-Api-Version' => $this->apiVersion(),
        ];
    }

    private function baseUrl(): string
    {
        $base = rtrim((string) config(
            'places.providers.foursquare.base_url',
            'https://places-api.foursquare.com'
        ), '/');

        if (str_contains($base, 'api.foursquare.com')) {
            $base = 'https://places-api.foursquare.com';
        }

        return $base;
    }

    /**
     * @param  array<string, mixed>  $params
     * @return array<string, mixed>
     */
    private function get(string $path, array $params): array
    {
        try {
            $response = Http::timeout($this->timeout())
                ->withHeaders($this->authHeaders())
                ->get($this->baseUrl().$path, $params);
        } catch (ConnectionException) {
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
     * @param  array<int, mixed>  $rows
     * @return list<PlaceResult>
     */
    private function mapPlaces(array $rows): array
    {
        $results = [];
        foreach ($rows as $row) {
            if (! is_array($row)) {
                continue;
            }

            // New Places API returns lat/lng at the top level; legacy used geocodes.main.
            $lat = isset($row['latitude']) && is_numeric($row['latitude']) ? (float) $row['latitude'] : null;
            $lng = isset($row['longitude']) && is_numeric($row['longitude']) ? (float) $row['longitude'] : null;
            if ($lat === null || $lng === null) {
                $geocode = is_array($row['geocodes']['main'] ?? null) ? $row['geocodes']['main'] : [];
                $lat = isset($geocode['latitude']) && is_numeric($geocode['latitude']) ? (float) $geocode['latitude'] : null;
                $lng = isset($geocode['longitude']) && is_numeric($geocode['longitude']) ? (float) $geocode['longitude'] : null;
            }
            if ($lat === null || $lng === null) {
                continue;
            }

            $location = is_array($row['location'] ?? null) ? $row['location'] : [];
            $address = trim((string) (
                $location['formatted_address']
                ?? $location['address']
                ?? ''
            ));
            $categories = [];
            foreach ($row['categories'] ?? [] as $cat) {
                if (is_array($cat) && isset($cat['name'])) {
                    $categories[] = (string) $cat['name'];
                }
            }

            $results[] = new PlaceResult(
                id: (string) ($row['fsq_place_id'] ?? $row['fsq_id'] ?? uniqid('fsq_', true)),
                name: trim((string) ($row['name'] ?? 'Place')) ?: 'Place',
                formattedAddress: $address,
                latitude: $lat,
                longitude: $lng,
                provider: $this->name(),
                confidence: 0.8,
                categories: $categories,
                phone: isset($row['tel']) ? (string) $row['tel'] : (isset($row['phone']) ? (string) $row['phone'] : null),
                website: isset($row['website']) ? (string) $row['website'] : null,
                rating: isset($row['rating']) && is_numeric($row['rating']) ? (float) $row['rating'] : null,
                openingHours: $this->mapOpeningHours($row),
                sources: [],
                rawMeta: $row,
            );
        }

        return $results;
    }

    private function premiumFieldsEnabled(): bool
    {
        return (bool) config('places.foursquare_premium_fields', false);
    }

    private function premiumFieldList(): string
    {
        // Lean premium set — no photos blobs.
        return 'fsq_place_id,name,geocodes,location,categories,tel,website,rating,hours';
    }

    /**
     * @param  array<string, mixed>  $row
     */
    private function mapOpeningHours(array $row): ?string
    {
        $hours = $row['hours'] ?? null;
        if (! is_array($hours)) {
            return null;
        }
        if (isset($hours['display']) && is_string($hours['display']) && trim($hours['display']) !== '') {
            return trim($hours['display']);
        }
        if (isset($hours['regular']) && is_array($hours['regular'])) {
            return json_encode($hours['regular']) ?: null;
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $place
     * @param  array<string, mixed>  $text
     */
    private function mapSuggestion(array $place, array $text): ?PlaceSuggestion
    {
        $id = (string) ($place['fsq_place_id'] ?? $place['fsq_id'] ?? '');
        $name = trim((string) ($text['primary'] ?? $place['name'] ?? ''));
        $location = is_array($place['location'] ?? null) ? $place['location'] : [];
        $address = trim((string) (
            $text['secondary']
            ?? $location['formatted_address']
            ?? $location['address']
            ?? ''
        ));
        if ($id === '' || $name === '') {
            return null;
        }

        $lat = isset($place['latitude']) && is_numeric($place['latitude']) ? (float) $place['latitude'] : null;
        $lng = isset($place['longitude']) && is_numeric($place['longitude']) ? (float) $place['longitude'] : null;

        $categories = [];
        foreach ($place['categories'] ?? [] as $cat) {
            if (is_array($cat) && isset($cat['name'])) {
                $categories[] = (string) $cat['name'];
            }
        }

        return new PlaceSuggestion(
            id: $id,
            name: $name,
            formattedAddress: $address !== '' ? $address : $name,
            provider: $this->name(),
            latitude: $lat,
            longitude: $lng,
            confidence: 0.8,
            categories: $categories,
            rawMeta: $place,
        );
    }
}
