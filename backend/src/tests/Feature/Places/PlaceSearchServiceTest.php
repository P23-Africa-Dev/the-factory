<?php

declare(strict_types=1);

namespace Tests\Feature\Places;

use App\DTO\Places\PlaceSuggestion;
use App\Services\Places\PlaceSearchService;
use App\Services\Places\Providers\FoursquareProvider;
use App\Services\Places\Providers\GeoapifyProvider;
use App\Services\Places\Providers\GooglePlacesProvider;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Mockery;
use Tests\Support\ActivatesCompanySubscription;
use Tests\TestCase;

class PlaceSearchServiceTest extends TestCase
{
    use ActivatesCompanySubscription;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'places.cache_enabled' => false,
            'places.quality_threshold' => 0.5,
            'places.fanout.enabled' => true,
            'places.fanout.backstop_relevance_floor' => 0.5,
            'places.providers.geoapify.enabled' => true,
            'places.providers.geoapify.api_key' => 'test-geo',
            'places.providers.foursquare.enabled' => true,
            'places.providers.foursquare.api_key' => 'test-fsq',
            'places.providers.google.enabled' => true,
            'places.providers.google.api_key' => 'test-google',
            'places.google_daily_budget' => 0,
        ]);
    }

    public function test_fanout_merges_geoapify_and_foursquare_and_ranks(): void
    {
        $geo = Mockery::mock(GeoapifyProvider::class);
        $fsq = Mockery::mock(FoursquareProvider::class);
        $google = Mockery::mock(GooglePlacesProvider::class);

        $geo->shouldReceive('name')->andReturn('geoapify');
        $geo->shouldReceive('isConfigured')->andReturn(true);
        $geo->shouldReceive('autocomplete')
            ->once()
            ->andReturn([
                new PlaceSuggestion(
                    id: 'g1',
                    name: 'Jaraguá Mall',
                    formattedAddress: 'Piracicaba, Brazil',
                    provider: 'geoapify',
                    latitude: -22.7,
                    longitude: -47.6,
                    confidence: 1.0,
                ),
            ]);

        $fsq->shouldReceive('name')->andReturn('foursquare');
        $fsq->shouldReceive('isConfigured')->andReturn(true);
        $fsq->shouldReceive('autocomplete')
            ->once()
            ->andReturn([
                new PlaceSuggestion(
                    id: 'f1',
                    name: 'Jara Mall',
                    formattedAddress: 'Ikeja, Lagos',
                    provider: 'foursquare',
                    latitude: 6.60,
                    longitude: 3.35,
                    confidence: 0.9,
                ),
            ]);

        // Strong Foursquare hit → Google should not be needed.
        $google->shouldReceive('name')->andReturn('google');
        $google->shouldReceive('isConfigured')->andReturn(true);
        $google->shouldNotReceive('autocomplete');

        $this->app->instance(GeoapifyProvider::class, $geo);
        $this->app->instance(FoursquareProvider::class, $fsq);
        $this->app->instance(GooglePlacesProvider::class, $google);

        $outcome = app(PlaceSearchService::class)->autocomplete('Jara Mall', null, null, 6.60, 3.35);

        $this->assertSame('foursquare', $outcome->providerFinal);
        $this->assertSame('Jara Mall', $outcome->results[0]->name);
        $this->assertContains('geoapify', $outcome->providersTried);
        $this->assertContains('foursquare', $outcome->providersTried);
        $this->assertNotContains('google', $outcome->providersTried);
    }

    public function test_relaxes_to_brand_core_when_verbatim_is_weak(): void
    {
        $geo = Mockery::mock(GeoapifyProvider::class);
        $fsq = Mockery::mock(FoursquareProvider::class);
        $google = Mockery::mock(GooglePlacesProvider::class);

        $geo->shouldReceive('name')->andReturn('geoapify');
        $geo->shouldReceive('isConfigured')->andReturn(true);
        $geo->shouldReceive('autocomplete')->andReturn([
            new PlaceSuggestion(
                id: 'g1',
                name: 'Jaraguá Mall',
                formattedAddress: 'Piracicaba, Brazil',
                provider: 'geoapify',
                latitude: -22.7,
                longitude: -47.6,
                confidence: 1.0,
            ),
        ]);

        $fsq->shouldReceive('name')->andReturn('foursquare');
        $fsq->shouldReceive('isConfigured')->andReturn(true);
        $fsq->shouldReceive('autocomplete')
            ->with('Jara Shopping Mall', Mockery::any(), Mockery::any(), Mockery::any())
            ->andReturn([]);
        $fsq->shouldReceive('autocomplete')
            ->with('jara', Mockery::any(), Mockery::any(), Mockery::any())
            ->andReturn([
                new PlaceSuggestion(
                    id: 'f1',
                    name: 'Jara Mall',
                    formattedAddress: 'Ikeja, Lagos',
                    provider: 'foursquare',
                    latitude: 6.60,
                    longitude: 3.35,
                    confidence: 0.9,
                ),
            ]);

        $google->shouldReceive('name')->andReturn('google');
        $google->shouldReceive('isConfigured')->andReturn(false);
        $google->shouldNotReceive('autocomplete');

        $this->app->instance(GeoapifyProvider::class, $geo);
        $this->app->instance(FoursquareProvider::class, $fsq);
        $this->app->instance(GooglePlacesProvider::class, $google);

        $outcome = app(PlaceSearchService::class)->autocomplete('Jara Shopping Mall', null, null, 6.60, 3.35);

        $this->assertSame('foursquare', $outcome->providerFinal);
        $this->assertSame('Jara Mall', $outcome->results[0]->name);
    }

    public function test_google_backstop_when_fanout_is_weak(): void
    {
        config(['places.google_daily_budget' => 100]);

        $geo = Mockery::mock(GeoapifyProvider::class);
        $fsq = Mockery::mock(FoursquareProvider::class);
        $google = Mockery::mock(GooglePlacesProvider::class);

        $geo->shouldReceive('name')->andReturn('geoapify');
        $geo->shouldReceive('isConfigured')->andReturn(true);
        $geo->shouldReceive('autocomplete')->andReturn([]);

        $fsq->shouldReceive('name')->andReturn('foursquare');
        $fsq->shouldReceive('isConfigured')->andReturn(true);
        $fsq->shouldReceive('autocomplete')->andReturn([]);

        $google->shouldReceive('name')->andReturn('google');
        $google->shouldReceive('isConfigured')->andReturn(true);
        $google->shouldReceive('autocomplete')
            ->once()
            ->andReturn([
                new PlaceSuggestion(
                    id: 'ChIJ',
                    name: 'Domino\'s Pizza',
                    formattedAddress: 'Ikeja, Lagos',
                    provider: 'google',
                    latitude: 6.60,
                    longitude: 3.35,
                    confidence: 0.9,
                ),
            ]);

        $this->app->instance(GeoapifyProvider::class, $geo);
        $this->app->instance(FoursquareProvider::class, $fsq);
        $this->app->instance(GooglePlacesProvider::class, $google);

        $outcome = app(PlaceSearchService::class)->autocomplete('Domino Pizza', null, null, 6.60, 3.35);

        $this->assertSame('google', $outcome->providerFinal);
        $this->assertContains('google', $outcome->providersTried);
        $this->assertGreaterThan(0, count($outcome->results));
    }

    public function test_does_not_zero_out_best_effort_results(): void
    {
        $geo = Mockery::mock(GeoapifyProvider::class);
        $fsq = Mockery::mock(FoursquareProvider::class);
        $google = Mockery::mock(GooglePlacesProvider::class);

        $geo->shouldReceive('name')->andReturn('geoapify');
        $geo->shouldReceive('isConfigured')->andReturn(true);
        $geo->shouldReceive('autocomplete')->andReturn([
            new PlaceSuggestion(
                id: 'g1',
                name: 'Jaraguá Mall',
                formattedAddress: 'Piracicaba, Brazil',
                provider: 'geoapify',
                latitude: -22.7,
                longitude: -47.6,
                confidence: 1.0,
            ),
        ]);

        $fsq->shouldReceive('name')->andReturn('foursquare');
        $fsq->shouldReceive('isConfigured')->andReturn(true);
        $fsq->shouldReceive('autocomplete')->andReturn([]);

        $google->shouldReceive('name')->andReturn('google');
        $google->shouldReceive('isConfigured')->andReturn(false);

        $this->app->instance(GeoapifyProvider::class, $geo);
        $this->app->instance(FoursquareProvider::class, $fsq);
        $this->app->instance(GooglePlacesProvider::class, $google);

        $outcome = app(PlaceSearchService::class)->autocomplete('Jara Mall');

        // Soft filter keeps best-effort (no hard empty-suppression).
        $this->assertGreaterThan(0, count($outcome->results));
        $this->assertSame('ok', $outcome->status);
    }

    public function test_cache_hit_skips_providers(): void
    {
        config(['places.cache_enabled' => true]);

        Http::fake();

        $geo = Mockery::mock(GeoapifyProvider::class);
        $fsq = Mockery::mock(FoursquareProvider::class);
        $google = Mockery::mock(GooglePlacesProvider::class);

        $geo->shouldReceive('name')->andReturn('geoapify');
        $geo->shouldReceive('isConfigured')->andReturn(true);
        $geo->shouldReceive('autocomplete')
            ->once()
            ->andReturn([
                new PlaceSuggestion(
                    id: 'g1',
                    name: 'Ikeja',
                    formattedAddress: 'Ikeja, Lagos',
                    provider: 'geoapify',
                    latitude: 6.6,
                    longitude: 3.3,
                    confidence: 0.9,
                ),
            ]);
        $fsq->shouldReceive('name')->andReturn('foursquare');
        $fsq->shouldReceive('isConfigured')->andReturn(false);
        $google->shouldReceive('name')->andReturn('google');
        $google->shouldReceive('isConfigured')->andReturn(false);

        $this->app->instance(GeoapifyProvider::class, $geo);
        $this->app->instance(FoursquareProvider::class, $fsq);
        $this->app->instance(GooglePlacesProvider::class, $google);

        $service = app(PlaceSearchService::class);
        $first = $service->autocomplete('Ikeja');
        $second = $service->autocomplete('Ikeja');

        $this->assertFalse($first->cacheHit);
        $this->assertTrue($second->cacheHit);
        $this->assertSame('geoapify', $second->providerFinal);
    }

    public function test_prefers_coord_bearing_foursquare_over_geoapify_name_stub(): void
    {
        $geo = Mockery::mock(GeoapifyProvider::class);
        $fsq = Mockery::mock(FoursquareProvider::class);
        $google = Mockery::mock(GooglePlacesProvider::class);

        $geo->shouldReceive('name')->andReturn('geoapify');
        $geo->shouldReceive('isConfigured')->andReturn(true);
        $geo->shouldReceive('autocomplete')->andReturn([
            new PlaceSuggestion(
                id: 'g-stub',
                name: 'Jara Mall',
                formattedAddress: 'Lagos',
                provider: 'geoapify',
                latitude: null,
                longitude: null,
                confidence: 1.0,
            ),
        ]);

        $fsq->shouldReceive('name')->andReturn('foursquare');
        $fsq->shouldReceive('isConfigured')->andReturn(true);
        $fsq->shouldReceive('autocomplete')->andReturn([
            new PlaceSuggestion(
                id: 'f1',
                name: 'Jara Mall',
                formattedAddress: 'Ikeja, Lagos',
                provider: 'foursquare',
                latitude: 6.6012,
                longitude: 3.3511,
                confidence: 0.9,
            ),
        ]);

        $google->shouldReceive('name')->andReturn('google');
        $google->shouldReceive('isConfigured')->andReturn(true);
        $google->shouldNotReceive('autocomplete');

        $this->app->instance(GeoapifyProvider::class, $geo);
        $this->app->instance(FoursquareProvider::class, $fsq);
        $this->app->instance(GooglePlacesProvider::class, $google);

        $outcome = app(PlaceSearchService::class)->autocomplete('Jara Mall', null, null, 6.60, 3.35);

        $this->assertSame('foursquare', $outcome->providerFinal);
        $this->assertSame('Jara Mall', $outcome->results[0]->name);
        $this->assertSame(6.6012, $outcome->results[0]->latitude);
        $this->assertSame(3.3511, $outcome->results[0]->longitude);
        $this->assertCount(1, $outcome->results);
    }
}
