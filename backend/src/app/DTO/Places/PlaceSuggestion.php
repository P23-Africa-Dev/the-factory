<?php

declare(strict_types=1);

namespace App\DTO\Places;

final class PlaceSuggestion
{
    /**
     * @param  list<string>  $categories
     * @param  array<string, mixed>  $rawMeta
     */
    public function __construct(
        public readonly string $id,
        public readonly string $name,
        public readonly string $formattedAddress,
        public readonly string $provider,
        public readonly ?float $latitude = null,
        public readonly ?float $longitude = null,
        public readonly ?float $confidence = null,
        public readonly array $categories = [],
        public readonly array $rawMeta = [],
    ) {}

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
        ];
    }
}
