<?php

declare(strict_types=1);

namespace App\Contracts\Places;

use App\DTO\Places\PlaceResult;
use App\DTO\Places\PlaceSuggestion;

interface PlaceSearchProviderInterface
{
    public function name(): string;

    public function isConfigured(): bool;

    /**
     * @return list<PlaceSuggestion>
     */
    public function autocomplete(string $query, ?float $lat, ?float $lng, int $limit): array;

    /**
     * @return list<PlaceResult>
     */
    public function search(string $query, ?float $lat, ?float $lng, int $limit): array;

    /**
     * @param  list<string>|null  $categories
     * @return list<PlaceResult>
     */
    public function nearby(float $lat, float $lng, int $radiusM, ?array $categories, int $limit): array;

    public function details(string $id): ?PlaceResult;

    public function geocode(string $query): ?PlaceResult;

    public function reverseGeocode(float $lat, float $lng): ?PlaceResult;
}
