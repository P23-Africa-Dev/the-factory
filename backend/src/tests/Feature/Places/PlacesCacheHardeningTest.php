<?php

declare(strict_types=1);

namespace Tests\Feature\Places;

use App\DTO\Places\PlaceSuggestion;
use App\Services\Places\PlaceSearchService;
use App\Services\Places\Providers\FoursquareProvider;
use App\Services\Places\Providers\GeoapifyProvider;
use App\Services\Places\Providers\GooglePlacesProvider;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Mockery;
use Tests\Support\ActivatesCompanySubscription;
use Tests\TestCase;

class PlacesCacheHardeningTest extends TestCase
{
    use ActivatesCompanySubscription;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'cache.default' => 'array',
            'places.cache_enabled' => true,
            'places.quality_threshold' => 0.5,
            'places.fanout.enabled' => true,
            'places.ttl.empty' => 900,
            'places.max_results_autocomplete' => 12,
            'places.providers.geoapify.enabled' => true,
            'places.providers.geoapify.api_key' => 'test-geo',
            'places.providers.foursquare.enabled' => true,
            'places.providers.foursquare.api_key' => 'test-fsq',
            'places.providers.google.enabled' => false,
            'places.providers.google.api_key' => '',
            'places.google_daily_budget' => 0,
        ]);
        Cache::flush();
    }

    public function test_empty_results_are_negatively_cached(): void
    {
        $geo = Mockery::mock(GeoapifyProvider::class);
        $fsq = Mockery::mock(FoursquareProvider::class);
        $google = Mockery::mock(GooglePlacesProvider::class);

        $geo->shouldReceive('name')->andReturn('geoapify');
        $geo->shouldReceive('isConfigured')->andReturn(true);
        $geo->shouldReceive('autocomplete')->once()->andReturn([]);

        $fsq->shouldReceive('name')->andReturn('foursquare');
        $fsq->shouldReceive('isConfigured')->andReturn(true);
        $fsq->shouldReceive('autocomplete')->once()->andReturn([]);

        $google->shouldReceive('name')->andReturn('google');
        $google->shouldReceive('isConfigured')->andReturn(false);

        $this->app->instance(GeoapifyProvider::class, $geo);
        $this->app->instance(FoursquareProvider::class, $fsq);
        $this->app->instance(GooglePlacesProvider::class, $google);

        $service = app(PlaceSearchService::class);
        $first = $service->autocomplete('zzznomatch');
        $second = $service->autocomplete('zzznomatch');

        $this->assertSame('empty', $first->status);
        $this->assertFalse($first->cacheHit);
        $this->assertTrue($second->cacheHit);
        $this->assertSame('empty', $second->status);
    }

    public function test_cache_hit_slices_to_requested_limit(): void
    {
        $rows = [];
        for ($i = 1; $i <= 8; $i++) {
            $rows[] = new PlaceSuggestion(
                id: 'g'.$i,
                name: 'Place '.$i,
                formattedAddress: 'Lagos '.$i,
                provider: 'geoapify',
                latitude: 6.5 + ($i * 0.002),
                longitude: 3.3 + ($i * 0.002),
                confidence: 0.9,
            );
        }

        $geo = Mockery::mock(GeoapifyProvider::class);
        $fsq = Mockery::mock(FoursquareProvider::class);
        $google = Mockery::mock(GooglePlacesProvider::class);

        $geo->shouldReceive('name')->andReturn('geoapify');
        $geo->shouldReceive('isConfigured')->andReturn(true);
        $geo->shouldReceive('autocomplete')->once()->andReturn($rows);
        $fsq->shouldReceive('name')->andReturn('foursquare');
        $fsq->shouldReceive('isConfigured')->andReturn(false);
        $google->shouldReceive('name')->andReturn('google');
        $google->shouldReceive('isConfigured')->andReturn(false);

        $this->app->instance(GeoapifyProvider::class, $geo);
        $this->app->instance(FoursquareProvider::class, $fsq);
        $this->app->instance(GooglePlacesProvider::class, $google);

        $service = app(PlaceSearchService::class);
        $wide = $service->autocomplete('many places', null, null, 6.60, 3.35, 8);
        $this->assertFalse($wide->cacheHit);
        $this->assertGreaterThanOrEqual(8, count($wide->results));

        $narrow = $service->autocomplete('many places', null, null, 6.60, 3.35, 3);
        $this->assertTrue($narrow->cacheHit);
        $this->assertCount(3, $narrow->results);
    }
}
