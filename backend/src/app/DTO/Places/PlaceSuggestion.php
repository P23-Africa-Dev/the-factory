<?php

declare(strict_types=1);

namespace App\DTO\Places;

final class PlaceSuggestion
{
    /**
     * @param  list<string>  $categories
     * @param  list<array{provider: string, id: string}>  $sources
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
            'sources' => $this->resolvedSources(),
        ];
    }

    /**
     * @param  list<array{provider: string, id: string}>  $sources
     */
    public function withMergedAttribution(
        string $id,
        string $provider,
        ?float $latitude,
        ?float $longitude,
        ?float $confidence,
        string $name,
        string $formattedAddress,
        array $categories,
        array $sources,
        array $rawMeta = [],
    ): self {
        return new self(
            id: $id,
            name: $name,
            formattedAddress: $formattedAddress,
            provider: $provider,
            latitude: $latitude,
            longitude: $longitude,
            confidence: $confidence,
            categories: $categories,
            sources: $sources,
            rawMeta: $rawMeta,
        );
    }
}
