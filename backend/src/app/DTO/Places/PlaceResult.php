<?php

declare(strict_types=1);

namespace App\DTO\Places;

final class PlaceResult
{
    /**
     * @param  list<string>  $categories
     * @param  array{0: float, 1: float, 2: float, 3: float}|null  $bbox
     * @param  list<array{provider: string, id: string}>  $sources
     * @param  array<string, mixed>  $rawMeta
     */
    public function __construct(
        public readonly string $id,
        public readonly string $name,
        public readonly string $formattedAddress,
        public readonly float $latitude,
        public readonly float $longitude,
        public readonly string $provider,
        public readonly ?float $confidence = null,
        public readonly array $categories = [],
        public readonly ?string $phone = null,
        public readonly ?string $website = null,
        public readonly ?float $rating = null,
        public readonly ?string $openingHours = null,
        public readonly ?array $bbox = null,
        public readonly array $sources = [],
        public readonly array $rawMeta = [],
    ) {}

    /**
     * @return list<array{provider: string, id: string}>
     */
    public function resolvedSources(): array
    {
        if ($this->sources !== []) {
            return array_values($this->sources);
        }

        return [['provider' => $this->provider, 'id' => $this->id]];
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'formatted_address' => $this->formattedAddress,
            'latitude' => $this->latitude,
            'longitude' => $this->longitude,
            'provider' => $this->provider,
            'confidence' => $this->confidence,
            'categories' => $this->categories,
            'phone' => $this->phone,
            'website' => $this->website,
            'rating' => $this->rating,
            'opening_hours' => $this->openingHours,
            'bbox' => $this->bbox,
            'sources' => $this->resolvedSources(),
        ];
    }
}
