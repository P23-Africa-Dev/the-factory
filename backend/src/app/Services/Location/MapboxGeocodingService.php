<?php

declare(strict_types=1);

namespace App\Services\Location;

use App\Models\Company;
use App\Services\Demo\DemoCompanyService;
use App\Services\Places\PlaceSearchService;

/**
 * Compatibility facade: server geocode/reverse goes through the Places
 * orchestrator (Geoapify → Foursquare → Google). Demo companies keep synthetic
 * centroids. Class name retained for existing DI bindings.
 */
class MapboxGeocodingService
{
    public function __construct(
        private readonly DemoCompanyService $demoCompanyService,
        private readonly PlaceSearchService $places,
    ) {}

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

        $companyModel = $this->resolveCompany($company);
        $outcome = $this->places->geocode(
            query: $trimmed,
            company: $companyModel,
            user: null,
            source: 'system',
        );

        $place = $outcome->results[0] ?? null;
        if ($place === null || ! isset($place->latitude, $place->longitude)) {
            return null;
        }

        /** @var \App\DTO\Places\PlaceResult $place */
        return [
            'latitude' => $place->latitude,
            'longitude' => $place->longitude,
            'place_name' => $place->formattedAddress !== '' ? $place->formattedAddress : $place->name,
        ];
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

        $companyModel = $this->resolveCompany($company);
        $outcome = $this->places->reverseGeocode(
            lat: $latitude,
            lng: $longitude,
            company: $companyModel,
            user: null,
            source: 'system',
        );

        $place = $outcome->results[0] ?? null;
        if ($place === null) {
            return null;
        }

        /** @var \App\DTO\Places\PlaceResult $place */
        return [
            'place_name' => $place->formattedAddress !== '' ? $place->formattedAddress : $place->name,
        ];
    }

    private function resolveCompany(Company|int|null $company): ?Company
    {
        if ($company instanceof Company) {
            return $company;
        }
        if (is_int($company)) {
            return Company::query()->find($company);
        }

        return null;
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
