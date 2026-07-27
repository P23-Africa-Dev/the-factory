<?php

declare(strict_types=1);

namespace App\DTO\Places;

final class PlaceSearchOutcome
{
    /**
     * @param  list<PlaceSuggestion|PlaceResult>  $results
     * @param  list<string>  $providersTried
     * @param  array<string, mixed>|null  $credits
     */
    public function __construct(
        public readonly array $results,
        public readonly ?string $providerFinal,
        public readonly array $providersTried,
        public readonly bool $cacheHit,
        public readonly int $fallbackDepth,
        public readonly float $confidence,
        public readonly int $latencyMs,
        public readonly ?array $credits = null,
        public readonly string $status = 'ok',
    ) {}

    /**
     * @return array{data: list<array<string, mixed>>, meta: array<string, mixed>}
     */
    public function toApiEnvelope(): array
    {
        $data = array_map(static function (PlaceSuggestion|PlaceResult $item): array {
            return $item->toArray();
        }, $this->results);

        return [
            'data' => $data,
            'meta' => [
                'provider' => $this->providerFinal,
                'cache_hit' => $this->cacheHit,
                'confidence' => $this->confidence,
                'fallback_depth' => $this->fallbackDepth,
                'providers_tried' => $this->providersTried,
                'latency_ms' => $this->latencyMs,
                'credits' => $this->credits,
                'status' => $this->status,
            ],
        ];
    }
}
