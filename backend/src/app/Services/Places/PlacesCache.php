<?php

declare(strict_types=1);

namespace App\Services\Places;

use Illuminate\Support\Facades\Cache;

final class PlacesCache
{
    public function enabled(): bool
    {
        return (bool) config('places.cache_enabled', true);
    }

    public function get(string $operation, string $key): mixed
    {
        if (! $this->enabled()) {
            return null;
        }

        return Cache::get($this->fullKey($operation, $key));
    }

    public function put(string $operation, string $key, mixed $value, ?int $ttlSeconds = null): void
    {
        if (! $this->enabled()) {
            return;
        }

        $ttl = $ttlSeconds ?? (int) config("places.ttl.{$operation}", 1800);
        Cache::put($this->fullKey($operation, $key), $value, max(30, $ttl));
    }

    public function makeKey(string $operation, array $parts): string
    {
        $normalized = [];
        foreach ($parts as $part) {
            if (is_float($part)) {
                $normalized[] = number_format($part, 5, '.', '');
            } elseif (is_array($part)) {
                $normalized[] = md5(json_encode($part) ?: '');
            } else {
                $normalized[] = strtolower(trim((string) $part));
            }
        }

        return hash('sha256', $operation.'|'.implode('|', $normalized));
    }

    private function fullKey(string $operation, string $key): string
    {
        return "places:v1:{$operation}:{$key}";
    }
}
