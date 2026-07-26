<?php

declare(strict_types=1);

namespace App\Services\Places\Providers;

use App\Contracts\Places\PlaceSearchProviderInterface;
use App\DTO\Places\PlaceResult;
use App\DTO\Places\PlaceSuggestion;
use App\Services\Places\Exceptions\ProviderException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

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
            'limit' => max(1, min(10, $limit)),
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

    public function search(string $query, ?float $lat, ?float $lng, int $limit): array
    {
        $params = [
            'query' => $query,
            'limit' => max(1, min(20, $limit)),
        ];
        if ($lat !== null && $lng !== null) {
            $params['ll'] = "{$lat},{$lng}";
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
        } else {
            $params['categories'] = '13065,13032,13003,19014,10000'; // food, cafe, bar, hotel, business
        }

        $payload = $this->get('/places/search', $params);

        return $this->mapPlaces($payload['results'] ?? []);
    }

    public function details(string $id): ?PlaceResult
    {
        $payload = $this->get('/places/'.$id, []);
        if ($payload === []) {
            return null;
        }

        $mapped = $this->mapPlaces([$payload]);

        return $mapped[0] ?? null;
    }

    public function geocode(string $query): ?PlaceResult
    {
        // Foursquare is POI-oriented; treat as search.
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
        return trim((string) config('places.providers.foursquare.api_key'));
    }

    private function timeout(): float
    {
        return (float) config('places.timeouts.foursquare', 2.0);
    }

    /**
     * @param  array<string, mixed>  $params
     * @return array<string, mixed>
     */
    private function get(string $path, array $params): array
    {
        $base = rtrim((string) config('places.providers.foursquare.base_url'), '/');

        try {
            $response = Http::timeout($this->timeout())
                ->withHeaders([
                    'Authorization' => $this->apiKey(),
                    'Accept' => 'application/json',
                ])
                ->get($base.$path, $params);
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
            $geocode = is_array($row['geocodes']['main'] ?? null) ? $row['geocodes']['main'] : [];
            $lat = isset($geocode['latitude']) && is_numeric($geocode['latitude']) ? (float) $geocode['latitude'] : null;
            $lng = isset($geocode['longitude']) && is_numeric($geocode['longitude']) ? (float) $geocode['longitude'] : null;
            if ($lat === null || $lng === null) {
                continue;
            }

            $location = is_array($row['location'] ?? null) ? $row['location'] : [];
            $address = trim((string) ($location['formatted_address'] ?? $location['address'] ?? ''));
            $categories = [];
            foreach ($row['categories'] ?? [] as $cat) {
                if (is_array($cat) && isset($cat['name'])) {
                    $categories[] = (string) $cat['name'];
                }
            }

            $results[] = new PlaceResult(
                id: (string) ($row['fsq_id'] ?? $row['fsq_place_id'] ?? uniqid('fsq_', true)),
                name: trim((string) ($row['name'] ?? 'Place')) ?: 'Place',
                formattedAddress: $address,
                latitude: $lat,
                longitude: $lng,
                provider: $this->name(),
                confidence: 0.8,
                categories: $categories,
                phone: isset($row['tel']) ? (string) $row['tel'] : null,
                website: isset($row['website']) ? (string) $row['website'] : null,
                rating: isset($row['rating']) && is_numeric($row['rating']) ? (float) $row['rating'] : null,
                rawMeta: $row,
            );
        }

        return $results;
    }

    /**
     * @param  array<string, mixed>  $place
     * @param  array<string, mixed>  $text
     */
    private function mapSuggestion(array $place, array $text): ?PlaceSuggestion
    {
        $id = (string) ($place['fsq_id'] ?? $place['fsq_place_id'] ?? '');
        $name = trim((string) ($text['primary'] ?? $place['name'] ?? ''));
        $address = trim((string) ($text['secondary'] ?? $place['location']['formatted_address'] ?? ''));
        if ($id === '' || $name === '') {
            return null;
        }

        return new PlaceSuggestion(
            id: $id,
            name: $name,
            formattedAddress: $address !== '' ? $address : $name,
            provider: $this->name(),
            confidence: 0.75,
            categories: [],
            rawMeta: $place,
        );
    }
}
