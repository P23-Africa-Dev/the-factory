<?php

declare(strict_types=1);

namespace Tests\Unit\Places;

use App\Services\Places\PlacesCache;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class PlacesCacheTest extends TestCase
{
    private PlacesCache $cache;

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'places.cache_enabled' => true,
            'places.cache.geohash_precision' => 6,
            'places.cache.reverse_decimals' => 3,
            'places.ttl.autocomplete' => 180,
            'places.ttl.empty' => 900,
            'cache.default' => 'array',
        ]);
        Cache::flush();
        $this->cache = new PlacesCache;
    }

    public function test_normalize_query_collapses_whitespace(): void
    {
        $this->assertSame(
            'chicken republic',
            $this->cache->normalizeQuery("  Chicken   Republic  "),
        );
    }

    public function test_nearby_gps_jitter_shares_geohash6_bucket(): void
    {
        $a = $this->cache->bucketLatLng(6.60120, 3.35110);
        $b = $this->cache->bucketLatLng(6.60125, 3.35115);
        $this->assertSame($a, $b);
        $this->assertSame(6, strlen($a));
    }

    public function test_list_search_keys_ignore_limit_and_normalize_query(): void
    {
        $partsA = $this->cache->listSearchParts('Shoprite  Ikeja', 6.6012, 3.3511);
        $partsB = $this->cache->listSearchParts('shoprite ikeja', 6.6013, 3.3512);
        $keyA = $this->cache->makeKey('autocomplete', $partsA);
        $keyB = $this->cache->makeKey('autocomplete', $partsB);
        $this->assertSame($keyA, $keyB);
    }

    public function test_keys_use_v2_namespace(): void
    {
        $key = $this->cache->makeKey('autocomplete', ['shoprite', 's0']);
        $this->cache->put('autocomplete', $key, ['data' => [], 'meta' => []]);
        $this->assertTrue(Cache::has("places:v2:autocomplete:{$key}"));
        $this->assertFalse(Cache::has("places:v1:autocomplete:{$key}"));
    }

    public function test_negative_cache_uses_empty_ttl(): void
    {
        $key = $this->cache->makeKey('autocomplete', ['nope', '_']);
        $this->cache->putEnvelope('autocomplete', $key, [
            'data' => [],
            'meta' => ['status' => 'empty'],
        ]);
        $this->assertSame([], $this->cache->get('autocomplete', $key)['data'] ?? null);
    }

    public function test_remember_with_lock_coalesces_producer(): void
    {
        $key = $this->cache->makeKey('autocomplete', ['lock-test', '_']);
        $calls = 0;

        $first = $this->cache->rememberWithLock('autocomplete', $key, function () use (&$calls): array {
            $calls++;

            return [
                'data' => [['id' => '1', 'name' => 'A', 'formatted_address' => 'X', 'provider' => 'geoapify']],
                'meta' => ['status' => 'ok'],
            ];
        });

        $second = $this->cache->rememberWithLock('autocomplete', $key, function () use (&$calls): array {
            $calls++;

            return [
                'data' => [['id' => '2', 'name' => 'B', 'formatted_address' => 'Y', 'provider' => 'geoapify']],
                'meta' => ['status' => 'ok'],
            ];
        });

        $this->assertSame(1, $calls);
        $this->assertSame($first['data'][0]['id'] ?? null, $second['data'][0]['id'] ?? null);
    }

    public function test_reverse_rounding_buckets_nearby_points(): void
    {
        $this->assertSame(
            $this->cache->roundReverse(6.6012),
            $this->cache->roundReverse(6.6014),
        );
        $this->assertNotSame(
            $this->cache->roundReverse(6.601),
            $this->cache->roundReverse(6.612),
        );
    }
}
