<?php

declare(strict_types=1);

namespace App\Services\Places;

use Illuminate\Contracts\Cache\LockTimeoutException;
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

    /**
     * Cache a Places API envelope; empty data uses the negative (empty) TTL.
     *
     * @param  array{data?: mixed, meta?: mixed}  $envelope
     */
    public function putEnvelope(string $operation, string $key, array $envelope): void
    {
        $data = $envelope['data'] ?? null;
        $empty = ! is_array($data) || $data === [];
        $ttl = $empty
            ? (int) config('places.ttl.empty', 900)
            : null;

        $this->put($operation, $key, $envelope, $ttl);
    }

    /**
     * Stampede-safe remember: check → lock → double-check → produce → put.
     *
     * @param  callable(): array{data?: mixed, meta?: mixed}  $producer
     * @return array{data?: mixed, meta?: mixed}|mixed
     */
    public function rememberWithLock(string $operation, string $key, callable $producer): mixed
    {
        $cached = $this->get($operation, $key);
        if (is_array($cached)) {
            return $cached;
        }

        if (! $this->enabled()) {
            return $producer();
        }

        $lockSeconds = max(1, (int) config('places.cache.lock_seconds', 10));
        $lock = Cache::lock($this->lockKey($operation, $key), $lockSeconds);

        try {
            if ($lock->get()) {
                try {
                    $cached = $this->get($operation, $key);
                    if (is_array($cached)) {
                        return $cached;
                    }

                    $value = $producer();
                    if (is_array($value) && ($value['meta']['status'] ?? null) !== 'credits_blocked') {
                        $this->putEnvelope($operation, $key, $value);
                    }

                    return $value;
                } finally {
                    $lock->release();
                }
            }

            // Waiter: block briefly for the winner, then re-read.
            try {
                $lock->block(min(5, $lockSeconds));
            } catch (LockTimeoutException) {
                // Fall through — produce ourselves if still cold.
            }

            $cached = $this->get($operation, $key);
            if (is_array($cached)) {
                return $cached;
            }

            $value = $producer();
            if (is_array($value) && ($value['meta']['status'] ?? null) !== 'credits_blocked') {
                $this->putEnvelope($operation, $key, $value);
            }

            return $value;
        } catch (\Throwable) {
            // Locks unavailable (e.g. array cache in some tests) — produce without locking.
            $value = $producer();
            if (is_array($value) && ($value['meta']['status'] ?? null) !== 'credits_blocked') {
                $this->putEnvelope($operation, $key, $value);
            }

            return $value;
        }
    }

    /**
     * @param  list<mixed>  $parts
     */
    public function makeKey(string $operation, array $parts): string
    {
        $normalized = [];
        foreach ($parts as $part) {
            if (is_float($part) || is_int($part)) {
                $normalized[] = (string) $part;
            } elseif (is_array($part)) {
                $normalized[] = md5(json_encode($part) ?: '');
            } else {
                $normalized[] = $this->normalizeQuery((string) $part);
            }
        }

        return hash('sha256', $operation.'|'.implode('|', $normalized));
    }

    /**
     * Autocomplete/search key parts: normalized query + geohash bucket (no limit).
     *
     * @return list<string>
     */
    public function listSearchParts(?string $query, ?float $lat, ?float $lng): array
    {
        return [
            $this->normalizeQuery((string) $query),
            $this->bucketLatLng($lat, $lng),
        ];
    }

    /**
     * Nearby key parts: geohash + radius + categories (no limit).
     *
     * @param  list<string>|array<int, mixed>  $categories
     * @return list<mixed>
     */
    public function nearbyParts(float $lat, float $lng, int $radiusM, array $categories): array
    {
        return [
            $this->bucketLatLng($lat, $lng),
            max(100, min(5000, $radiusM)),
            array_values($categories),
        ];
    }

    /**
     * Reverse geocode key parts: ~100m grid.
     *
     * @return list<string>
     */
    public function reverseParts(float $lat, float $lng): array
    {
        return [
            $this->roundReverse($lat),
            $this->roundReverse($lng),
        ];
    }

    public function normalizeQuery(string $query): string
    {
        $q = strtolower(trim($query));
        $q = (string) preg_replace('/\s+/u', ' ', $q);

        return $q;
    }

    public function bucketLatLng(?float $lat, ?float $lng): string
    {
        if ($lat === null || $lng === null || ! is_finite($lat) || ! is_finite($lng)) {
            return '_';
        }

        $precision = max(1, min(12, (int) config('places.cache.geohash_precision', 6)));

        return $this->encodeGeohash($lat, $lng, $precision);
    }

    public function roundReverse(float $coord): string
    {
        $decimals = max(1, min(6, (int) config('places.cache.reverse_decimals', 3)));

        return number_format($coord, $decimals, '.', '');
    }

    private function lockKey(string $operation, string $key): string
    {
        return "places:lock:{$operation}:{$key}";
    }

    private function fullKey(string $operation, string $key): string
    {
        return "places:v2:{$operation}:{$key}";
    }

    /**
     * Minimal geohash encoder (no external package).
     */
    public function encodeGeohash(float $lat, float $lng, int $precision): string
    {
        $base32 = '0123456789bcdefghjkmnpqrstuvwxyz';
        $latMin = -90.0;
        $latMax = 90.0;
        $lngMin = -180.0;
        $lngMax = 180.0;
        $hash = '';
        $isLng = true;
        $bit = 0;
        $ch = 0;

        while (strlen($hash) < $precision) {
            if ($isLng) {
                $mid = ($lngMin + $lngMax) / 2;
                if ($lng >= $mid) {
                    $ch |= 1 << (4 - $bit);
                    $lngMin = $mid;
                } else {
                    $lngMax = $mid;
                }
            } else {
                $mid = ($latMin + $latMax) / 2;
                if ($lat >= $mid) {
                    $ch |= 1 << (4 - $bit);
                    $latMin = $mid;
                } else {
                    $latMax = $mid;
                }
            }

            $isLng = ! $isLng;
            if ($bit < 4) {
                $bit++;
            } else {
                $hash .= $base32[$ch];
                $bit = 0;
                $ch = 0;
            }
        }

        return $hash;
    }
}
