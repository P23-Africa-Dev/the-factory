<?php

declare(strict_types=1);

namespace App\Services\Places\Providers;

use App\Contracts\Places\PlaceSearchProviderInterface;
use App\DTO\Places\PlaceResult;
use App\DTO\Places\PlaceSuggestion;
use App\Services\Places\Exceptions\ProviderException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class GooglePlacesProvider implements PlaceSearchProviderInterface
{
    public function name(): string
    {
        return 'google';
    }

    public function isConfigured(): bool
    {
        if (! (bool) config('places.providers.google.enabled', true)) {
            return false;
        }

        return trim((string) config('places.providers.google.api_key')) !== '';
    }

    public function autocomplete(string $query, ?float $lat, ?float $lng, int $limit): array
    {
        $body = [
            'input' => $query,
            'includedPrimaryTypes' => [],
        ];
        if ($lat !== null && $lng !== null) {
            $body['locationBias'] = [
                'circle' => [
                    'center' => ['latitude' => $lat, 'longitude' => $lng],
                    'radius' => 5000.0,
                ],
            ];
        }

        $payload = $this->post('/places:autocomplete', $body, 'suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.text');
        $results = [];
        foreach ($payload['suggestions'] ?? [] as $suggestion) {
            if (! is_array($suggestion)) {
                continue;
            }
            $prediction = is_array($suggestion['placePrediction'] ?? null) ? $suggestion['placePrediction'] : null;
            if ($prediction === null) {
                continue;
            }
            $placeId = (string) ($prediction['placeId'] ?? '');
            $structured = is_array($prediction['structuredFormat'] ?? null) ? $prediction['structuredFormat'] : [];
            $main = is_array($structured['mainText'] ?? null) ? ($structured['mainText']['text'] ?? '') : '';
            $secondary = is_array($structured['secondaryText'] ?? null) ? ($structured['secondaryText']['text'] ?? '') : '';
            $text = is_array($prediction['text'] ?? null) ? (string) ($prediction['text']['text'] ?? '') : '';
            $name = trim((string) ($main !== '' ? $main : $text));
            if ($placeId === '' || $name === '') {
                continue;
            }
            $results[] = new PlaceSuggestion(
                id: $placeId,
                name: $name,
                formattedAddress: trim((string) ($secondary !== '' ? $secondary : $text)),
                provider: $this->name(),
                confidence: 0.85,
            );
            if (count($results) >= $limit) {
                break;
            }
        }

        return $results;
    }

    public function search(string $query, ?float $lat, ?float $lng, int $limit): array
    {
        $body = [
            'textQuery' => $query,
            'maxResultCount' => max(1, min(20, $limit)),
        ];
        if ($lat !== null && $lng !== null) {
            $body['locationBias'] = [
                'circle' => [
                    'center' => ['latitude' => $lat, 'longitude' => $lng],
                    'radius' => 5000.0,
                ],
            ];
        }

        $payload = $this->post(
            '/places:searchText',
            $body,
            'places.id,places.displayName,places.formattedAddress,places.location,places.types'
        );

        return $this->mapPlaces($payload['places'] ?? []);
    }

    public function nearby(float $lat, float $lng, int $radiusM, ?array $categories, int $limit): array
    {
        $types = $categories !== null && $categories !== []
            ? $categories
            : ['restaurant', 'cafe', 'supermarket', 'bank', 'pharmacy', 'hospital', 'lodging'];

        $payload = $this->post('/places:searchNearby', [
            'includedTypes' => array_values($types),
            'maxResultCount' => max(1, min(20, $limit)),
            'locationRestriction' => [
                'circle' => [
                    'center' => ['latitude' => $lat, 'longitude' => $lng],
                    'radius' => (float) max(100, min(5000, $radiusM)),
                ],
            ],
        ], 'places.id,places.displayName,places.formattedAddress,places.location,places.types');

        return $this->mapPlaces($payload['places'] ?? []);
    }

    public function details(string $id): ?PlaceResult
    {
        $placeId = Str::startsWith($id, 'places/') ? $id : 'places/'.$id;
        $payload = $this->get(
            '/'.$placeId,
            'id,displayName,formattedAddress,location,types,internationalPhoneNumber,websiteUri,rating,regularOpeningHours'
        );
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
        // Nearby with empty types + tiny radius as reverse approximation.
        $results = $this->search(sprintf('%.5f, %.5f', $lat, $lng), $lat, $lng, 1);

        return $results[0] ?? null;
    }

    private function apiKey(): string
    {
        return trim((string) config('places.providers.google.api_key'));
    }

    private function timeout(): float
    {
        return (float) config('places.timeouts.google', 2.5);
    }

    private function base(): string
    {
        return rtrim((string) config('places.providers.google.base_url'), '/');
    }

    /**
     * @param  array<string, mixed>  $body
     * @return array<string, mixed>
     */
    private function post(string $path, array $body, string $fieldMask): array
    {
        try {
            $response = Http::timeout($this->timeout())
                ->withHeaders([
                    'X-Goog-Api-Key' => $this->apiKey(),
                    'X-Goog-FieldMask' => $fieldMask,
                    'Content-Type' => 'application/json',
                ])
                ->post($this->base().$path, $body);
        } catch (ConnectionException) {
            throw ProviderException::timeout($this->name());
        }

        return $this->handleResponse($response->status(), $response->json());
    }

    /**
     * @return array<string, mixed>
     */
    private function get(string $path, string $fieldMask): array
    {
        try {
            $response = Http::timeout($this->timeout())
                ->withHeaders([
                    'X-Goog-Api-Key' => $this->apiKey(),
                    'X-Goog-FieldMask' => $fieldMask,
                ])
                ->get($this->base().$path);
        } catch (ConnectionException) {
            throw ProviderException::timeout($this->name());
        }

        return $this->handleResponse($response->status(), $response->json());
    }

    /**
     * @return array<string, mixed>
     */
    private function handleResponse(int $status, mixed $json): array
    {
        if ($status === 401 || $status === 403) {
            throw ProviderException::auth($this->name());
        }
        if ($status === 429) {
            throw ProviderException::rateLimited($this->name());
        }
        if ($status < 200 || $status >= 300) {
            throw ProviderException::unavailable($this->name(), 'HTTP '.$status);
        }
        if (! is_array($json)) {
            throw ProviderException::malformed($this->name());
        }

        return $json;
    }

    /**
     * @param  array<int, mixed>  $places
     * @return list<PlaceResult>
     */
    private function mapPlaces(array $places): array
    {
        $results = [];
        foreach ($places as $place) {
            if (! is_array($place)) {
                continue;
            }
            $location = is_array($place['location'] ?? null) ? $place['location'] : [];
            $lat = isset($location['latitude']) && is_numeric($location['latitude']) ? (float) $location['latitude'] : null;
            $lng = isset($location['longitude']) && is_numeric($location['longitude']) ? (float) $location['longitude'] : null;
            if ($lat === null || $lng === null) {
                continue;
            }

            $display = $place['displayName'] ?? null;
            $name = is_array($display) ? (string) ($display['text'] ?? 'Place') : (is_string($display) ? $display : 'Place');
            $id = (string) ($place['id'] ?? '');
            $id = Str::startsWith($id, 'places/') ? substr($id, 7) : $id;

            $hours = null;
            if (isset($place['regularOpeningHours']['weekdayDescriptions'][0])) {
                $hours = (string) $place['regularOpeningHours']['weekdayDescriptions'][0];
            }

            $results[] = new PlaceResult(
                id: $id !== '' ? $id : uniqid('ggl_', true),
                name: trim($name) !== '' ? trim($name) : 'Place',
                formattedAddress: trim((string) ($place['formattedAddress'] ?? '')),
                latitude: $lat,
                longitude: $lng,
                provider: $this->name(),
                confidence: 0.9,
                categories: isset($place['types']) && is_array($place['types'])
                    ? array_values(array_map('strval', $place['types']))
                    : [],
                phone: isset($place['internationalPhoneNumber']) ? (string) $place['internationalPhoneNumber'] : null,
                website: isset($place['websiteUri']) ? (string) $place['websiteUri'] : null,
                rating: isset($place['rating']) && is_numeric($place['rating']) ? (float) $place['rating'] : null,
                openingHours: $hours,
                rawMeta: $place,
            );
        }

        return $results;
    }
}
