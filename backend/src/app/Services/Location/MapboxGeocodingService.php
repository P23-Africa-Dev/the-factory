<?php

declare(strict_types=1);

namespace App\Services\Location;

use App\Models\Company;
use App\Services\Demo\DemoCompanyService;
use Illuminate\Support\Facades\Http;

class MapboxGeocodingService
{
    public function __construct(private readonly DemoCompanyService $demoCompanyService) {}

    /**
     * @return array{latitude: float, longitude: float, place_name: string|null}|null
     */
    public function geocodeAddress(string $address, Company|int|null $company = null): ?array
    {
        $trimmed = trim($address);
        if ($trimmed === '') {
            return null;
        }

        if ($company !== null && $this->demoCompanyService->isDemo($company)) {
            return $this->demoGeocode($trimmed, $company);
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

    /**
     * @return array{place_name: string|null}|null
     */
    public function reverseGeocodeCoordinates(float $latitude, float $longitude, Company|int|null $company = null): ?array
    {
        if ($company !== null && $this->demoCompanyService->isDemo($company)) {
            return [
                'place_name' => sprintf('%.4f, %.4f', $latitude, $longitude),
            ];
        }

        $token = trim((string) config('services.mapbox.access_token'));
        if ($token === '') {
            return null;
        }

        $url = sprintf(
            'https://api.mapbox.com/geocoding/v5/mapbox.places/%s,%s.json',
            rawurlencode((string) $longitude),
            rawurlencode((string) $latitude),
        );

        try {
            $response = Http::timeout(8)->get($url, [
                'access_token' => $token,
                'limit' => 1,
                'types' => 'address,poi,place,locality,neighborhood',
            ]);

            if (! $response->successful()) {
                return null;
            }

            /** @var array{features?: array<int, array{place_name?: string}>} $payload */
            $payload = $response->json();
            $feature = $payload['features'][0] ?? null;

            if (! is_array($feature)) {
                return null;
            }

            return [
                'place_name' => isset($feature['place_name']) && is_string($feature['place_name'])
                    ? trim($feature['place_name'])
                    : null,
            ];
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * @return array{latitude: float, longitude: float, place_name: string|null}
     */
    private function demoGeocode(string $address, Company|int $company): array
    {
        $model = $company instanceof Company
            ? $company
            : Company::query()->find((int) $company);

        $country = strtoupper((string) ($model?->country ?? 'DEFAULT'));
        $centroids = config('demo.geocode_centroids', []);
        $centroid = is_array($centroids[$country] ?? null)
            ? $centroids[$country]
            : ($centroids['DEFAULT'] ?? ['latitude' => 51.5074, 'longitude' => -0.1278, 'place_name' => 'Demo location']);

        return [
            'latitude' => (float) ($centroid['latitude'] ?? 51.5074),
            'longitude' => (float) ($centroid['longitude'] ?? -0.1278),
            'place_name' => $address !== '' ? $address : (isset($centroid['place_name']) ? (string) $centroid['place_name'] : null),
        ];
    }
}
