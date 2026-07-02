<?php

declare(strict_types=1);

namespace App\Services\Location;

use Illuminate\Support\Facades\Http;

class MapboxGeocodingService
{
    /**
     * @return array{latitude: float, longitude: float, place_name: string|null}|null
     */
    public function geocodeAddress(string $address): ?array
    {
        $trimmed = trim($address);
        if ($trimmed === '') {
            return null;
        }

        $token = trim((string) config('services.mapbox.access_token'));
        if ($token === '') {
            return null;
        }

        $url = 'https://api.mapbox.com/geocoding/v5/mapbox.places/' . rawurlencode($trimmed) . '.json';

        try {
            $response = Http::timeout(8)->get($url, [
                'access_token' => $token,
                'limit' => 1,
            ]);

            if (! $response->successful()) {
                return null;
            }

            /** @var array{features?: array<int, array{center?: array<int, mixed>, place_name?: string}>} $payload */
            $payload = $response->json();
            $feature = $payload['features'][0] ?? null;

            if (! is_array($feature)) {
                return null;
            }

            $center = $feature['center'] ?? null;
            if (! is_array($center) || count($center) !== 2) {
                return null;
            }

            $longitude = is_numeric($center[0]) ? (float) $center[0] : null;
            $latitude = is_numeric($center[1]) ? (float) $center[1] : null;

            if ($latitude === null || $longitude === null) {
                return null;
            }

            return [
                'latitude' => $latitude,
                'longitude' => $longitude,
                'place_name' => isset($feature['place_name']) && is_string($feature['place_name'])
                    ? trim($feature['place_name'])
                    : null,
            ];
        } catch (\Throwable) {
            return null;
        }
    }
}
