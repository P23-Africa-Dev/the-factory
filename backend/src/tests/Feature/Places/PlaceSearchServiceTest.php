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
            'places.providers.geoapify.enabled' => true,
            'places.providers.geoapify.api_key' => 'test-geo',
            'places.providers.foursquare.enabled' => true,
            'places.providers.foursquare.api_key' => 'test-fsq',
            'places.providers.google.enabled' => true,
            'places.providers.google.api_key' => 'test-google',
            'places.google_daily_budget' => 0,
        ]);
    }

    public function test_geoapify_success_skips_later_providers(): void
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
                    name: 'Shoprite Lekki',
                    formattedAddress: 'Lekki, Lagos',
                    provider: 'geoapify',
                    latitude: 6.45,
                    longitude: 3.47,
                    confidence: 0.95,
                ),
                new PlaceSuggestion(
                    id: 'g2',
                    name: 'Shoprite Ikeja',
                    formattedAddress: 'Ikeja, Lagos',
                    provider: 'geoapify',
                    latitude: 6.60,
                    longitude: 3.35,
                    confidence: 0.92,
                ),
            ]);

        $fsq->shouldReceive('name')->andReturn('foursquare');
        $fsq->shouldReceive('isConfigured')->andReturn(true);
        $fsq->shouldNotReceive('autocomplete');

        $google->shouldReceive('name')->andReturn('google');
        $google->shouldReceive('isConfigured')->andReturn(true);
        $google->shouldNotReceive('autocomplete');

        $this->app->instance(GeoapifyProvider::class, $geo);
        $this->app->instance(FoursquareProvider::class, $fsq);
        $this->app->instance(GooglePlacesProvider::class, $google);

        $outcome = app(PlaceSearchService::class)->autocomplete('Shoprite Lekki');

        $this->assertSame('geoapify', $outcome->providerFinal);
        $this->assertCount(2, $outcome->results);
        $this->assertSame(['geoapify'], $outcome->providersTried);
    }

    public function test_falls_back_to_foursquare_when_geoapify_empty(): void
    {
        $geo = Mockery::mock(GeoapifyProvider::class);
        $fsq = Mockery::mock(FoursquareProvider::class);
        $google = Mockery::mock(GooglePlacesProvider::class);

        $geo->shouldReceive('name')->andReturn('geoapify');
        $geo->shouldReceive('isConfigured')->andReturn(true);
        $geo->shouldReceive('autocomplete')->once()->andReturn([]);

        $fsq->shouldReceive('name')->andReturn('foursquare');
        $fsq->shouldReceive('isConfigured')->andReturn(true);
        $fsq->shouldReceive('autocomplete')
            ->once()
            ->andReturn([
                new PlaceSuggestion(
                    id: 'f1',
                    name: 'Chicken Republic',
                    formattedAddress: 'Ikeja',
                    provider: 'foursquare',
                    confidence: 0.9,
                ),
            ]);

        $google->shouldReceive('name')->andReturn('google');
        $google->shouldReceive('isConfigured')->andReturn(true);
        $google->shouldNotReceive('autocomplete');

        $this->app->instance(GeoapifyProvider::class, $geo);
        $this->app->instance(FoursquareProvider::class, $fsq);
        $this->app->instance(GooglePlacesProvider::class, $google);

        $outcome = app(PlaceSearchService::class)->autocomplete('Chicken Republic');

        $this->assertSame('foursquare', $outcome->providerFinal);
        $this->assertContains('geoapify', $outcome->providersTried);
        $this->assertContains('foursquare', $outcome->providersTried);
    }

    public function test_relaxes_query_to_brand_core_when_verbatim_phrasing_fails(): void
    {
        // Geoapify returns high-confidence but wrong-named places for every attempt.
        // Foursquare has nothing for the verbatim "Jara Shopping Mall" but does index
        // "Jara Mall" — the waterfall must retry with the stripped brand core "Jara".
        $geo = Mockery::mock(GeoapifyProvider::class);
        $fsq = Mockery::mock(FoursquareProvider::class);
        $google = Mockery::mock(GooglePlacesProvider::class);

        $geo->shouldReceive('name')->andReturn('geoapify');
        $geo->shouldReceive('isConfigured')->andReturn(true);
        $geo->shouldReceive('autocomplete')->andReturn([
            new PlaceSuggestion(
                id: 'g1',
                name: 'Jaraguá Mall',
                formattedAddress: 'Jaraguá, Piracicaba, Brazil',
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

        // Google is not needed and must never be reached.
        $google->shouldReceive('name')->andReturn('google');
        $google->shouldReceive('isConfigured')->andReturn(false);
        $google->shouldNotReceive('autocomplete');

        $this->app->instance(GeoapifyProvider::class, $geo);
        $this->app->instance(FoursquareProvider::class, $fsq);
        $this->app->instance(GooglePlacesProvider::class, $google);

        $outcome = app(PlaceSearchService::class)->autocomplete('Jara Shopping Mall');

        $this->assertSame('foursquare', $outcome->providerFinal);
        $this->assertCount(1, $outcome->results);
        $this->assertSame('Jara Mall', $outcome->results[0]->name);
    }

    public function test_suppresses_unrelated_result_for_brand_query(): void
    {
        // Only Geoapify answers, with a same-category place in the wrong country.
        // Nothing name-relevant exists, so an empty result is returned rather than junk.
        $geo = Mockery::mock(GeoapifyProvider::class);
        $fsq = Mockery::mock(FoursquareProvider::class);
        $google = Mockery::mock(GooglePlacesProvider::class);

        $geo->shouldReceive('name')->andReturn('geoapify');
        $geo->shouldReceive('isConfigured')->andReturn(true);
        $geo->shouldReceive('autocomplete')->andReturn([
            new PlaceSuggestion(
                id: 'g1',
                name: 'Jaraguá Mall',
                formattedAddress: 'Jaraguá, Piracicaba, Brazil',
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

        $this->assertNull($outcome->providerFinal);
        $this->assertCount(0, $outcome->results);
        $this->assertSame('empty', $outcome->status);
    }

    public function test_falls_back_to_google_when_earlier_providers_empty(): void
    {
        $geo = Mockery::mock(GeoapifyProvider::class);
        $fsq = Mockery::mock(FoursquareProvider::class);
        $google = Mockery::mock(GooglePlacesProvider::class);

        foreach ([[$geo, 'geoapify'], [$fsq, 'foursquare']] as [$mock, $name]) {
            $mock->shouldReceive('name')->andReturn($name);
            $mock->shouldReceive('isConfigured')->andReturn(true);
            $mock->shouldReceive('autocomplete')->once()->andReturn([]);
        }

        $google->shouldReceive('name')->andReturn('google');
        $google->shouldReceive('isConfigured')->andReturn(true);
        $google->shouldReceive('autocomplete')
            ->once()
            ->andReturn([
                new PlaceSuggestion(
                    id: 'ChIJ',
                    name: 'Unknown Estate',
                    formattedAddress: 'Lagos',
                    provider: 'google',
                    confidence: 0.9,
                ),
            ]);

        $this->app->instance(GeoapifyProvider::class, $geo);
        $this->app->instance(FoursquareProvider::class, $fsq);
        $this->app->instance(GooglePlacesProvider::class, $google);

        $outcome = app(PlaceSearchService::class)->autocomplete('Random Estate XYZ');

        $this->assertSame('google', $outcome->providerFinal);
        $this->assertSame(2, $outcome->fallbackDepth);
    }

    public function test_cache_hit_skips_providers(): void
    {
        config(['places.cache_enabled' => true]);

        Http::fake(); // no outbound

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
}
