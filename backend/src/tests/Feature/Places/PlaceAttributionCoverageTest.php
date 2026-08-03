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

class PlaceAttributionCoverageTest extends TestCase
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
            'places.show_provider_attribution' => true,
            'places.foursquare_premium_fields' => false,
            'places.max_results_autocomplete' => 12,
            'places.max_results_search' => 15,
            'places.providers.geoapify.enabled' => true,
            'places.providers.geoapify.api_key' => 'test-geo',
            'places.providers.foursquare.enabled' => true,
            'places.providers.foursquare.api_key' => 'test-fsq',
            'places.providers.google.enabled' => false,
            'places.providers.google.api_key' => '',
            'places.google_daily_budget' => 0,
        ]);
    }

    public function test_merge_unions_sources_and_keeps_foursquare_canonical(): void
    {
        $geo = Mockery::mock(GeoapifyProvider::class);
        $fsq = Mockery::mock(FoursquareProvider::class);
        $google = Mockery::mock(GooglePlacesProvider::class);

        $geo->shouldReceive('name')->andReturn('geoapify');
        $geo->shouldReceive('isConfigured')->andReturn(true);
        $geo->shouldReceive('autocomplete')->andReturn([
            new PlaceSuggestion(
                id: 'geo_1',
                name: 'Shoprite Ikeja',
                formattedAddress: 'Ikeja',
                provider: 'geoapify',
                latitude: 6.6010,
                longitude: 3.3510,
                confidence: 0.7,
            ),
        ]);

        $fsq->shouldReceive('name')->andReturn('foursquare');
        $fsq->shouldReceive('isConfigured')->andReturn(true);
        $fsq->shouldReceive('autocomplete')->andReturn([
            new PlaceSuggestion(
                id: 'fsq_1',
                name: 'Shoprite Ikeja',
                formattedAddress: 'Ikeja, Lagos',
                provider: 'foursquare',
                latitude: 6.6012,
                longitude: 3.3511,
                confidence: 0.9,
            ),
        ]);

        $google->shouldReceive('name')->andReturn('google');
        $google->shouldReceive('isConfigured')->andReturn(false);

        $this->app->instance(GeoapifyProvider::class, $geo);
        $this->app->instance(FoursquareProvider::class, $fsq);
        $this->app->instance(GooglePlacesProvider::class, $google);

        $outcome = app(PlaceSearchService::class)->autocomplete('Shoprite Ikeja', null, null, 6.60, 3.35);

        $this->assertCount(1, $outcome->results);
        $this->assertSame('foursquare', $outcome->results[0]->provider);
        $this->assertSame('fsq_1', $outcome->results[0]->id);
        $sources = $outcome->results[0]->resolvedSources();
        $this->assertCount(2, $sources);
        $providers = array_column($sources, 'provider');
        $this->assertContains('foursquare', $providers);
        $this->assertContains('geoapify', $providers);
        $this->assertSame(1, $outcome->sourcesMix['multi_source'] ?? 0);
    }

    public function test_api_meta_hides_attribution_when_setting_off(): void
    {
        config(['places.show_provider_attribution' => false]);

        ['user' => $user, 'company' => $company] = $this->createCompanyWithOwner();
        $this->activateCompanySubscription($company);
        $token = $this->ownerToken($user);

        $geo = Mockery::mock(GeoapifyProvider::class);
        $fsq = Mockery::mock(FoursquareProvider::class);
        $google = Mockery::mock(GooglePlacesProvider::class);

        $geo->shouldReceive('name')->andReturn('geoapify');
        $geo->shouldReceive('isConfigured')->andReturn(true);
        $geo->shouldReceive('autocomplete')->andReturn([
            new PlaceSuggestion(
                id: 'g1',
                name: 'Place',
                formattedAddress: 'Lagos',
                provider: 'geoapify',
                latitude: 6.5,
                longitude: 3.3,
                confidence: 0.8,
            ),
        ]);
        $fsq->shouldReceive('name')->andReturn('foursquare');
        $fsq->shouldReceive('isConfigured')->andReturn(false);
        $google->shouldReceive('name')->andReturn('google');
        $google->shouldReceive('isConfigured')->andReturn(false);

        $this->app->instance(GeoapifyProvider::class, $geo);
        $this->app->instance(FoursquareProvider::class, $fsq);
        $this->app->instance(GooglePlacesProvider::class, $google);

        $response = $this->withToken($token)->getJson(
            '/api/v1/places/autocomplete?q=place&limit=5&company_id='.$company->id
        );

        $response->assertOk()
            ->assertJsonPath('meta.attribution_visible', false)
            ->assertJsonPath('data.0.sources.0.provider', 'geoapify');
    }

    public function test_autocomplete_limit_clamped_to_admin_cap(): void
    {
        config(['places.max_results_autocomplete' => 3]);

        ['user' => $user, 'company' => $company] = $this->createCompanyWithOwner();
        $this->activateCompanySubscription($company);
        $token = $this->ownerToken($user);

        $geo = Mockery::mock(GeoapifyProvider::class);
        $fsq = Mockery::mock(FoursquareProvider::class);
        $google = Mockery::mock(GooglePlacesProvider::class);

        $rows = [];
        for ($i = 1; $i <= 8; $i++) {
            $rows[] = new PlaceSuggestion(
                id: 'g'.$i,
                name: 'Place '.$i,
                formattedAddress: 'Lagos '.$i,
                provider: 'geoapify',
                latitude: 6.5 + ($i * 0.01),
                longitude: 3.3 + ($i * 0.01),
                confidence: 0.8,
            );
        }

        $geo->shouldReceive('name')->andReturn('geoapify');
        $geo->shouldReceive('isConfigured')->andReturn(true);
        $geo->shouldReceive('autocomplete')
            ->once()
            ->withArgs(function (string $query, ?float $lat, ?float $lng, int $limit): bool {
                return $query === 'many' && $limit === 3;
            })
            ->andReturn($rows);
        $fsq->shouldReceive('name')->andReturn('foursquare');
        $fsq->shouldReceive('isConfigured')->andReturn(false);
        $google->shouldReceive('name')->andReturn('google');
        $google->shouldReceive('isConfigured')->andReturn(false);

        $this->app->instance(GeoapifyProvider::class, $geo);
        $this->app->instance(FoursquareProvider::class, $fsq);
        $this->app->instance(GooglePlacesProvider::class, $google);

        $response = $this->withToken($token)->getJson(
            '/api/v1/places/autocomplete?q=many&limit=20&company_id='.$company->id
        );

        $response->assertOk()
            ->assertJsonPath('meta.result_limit', 3)
            ->assertJsonCount(3, 'data');
    }

    public function test_foursquare_premium_fields_gate(): void
    {
        config([
            'places.foursquare_premium_fields' => false,
            'places.providers.foursquare.api_key' => 'fsq-test-key',
            'places.providers.foursquare.base_url' => 'https://places-api.foursquare.com',
        ]);

        Http::fake([
            'places-api.foursquare.com/*' => Http::response(['results' => []], 200),
        ]);

        $provider = app(FoursquareProvider::class);
        $provider->search('coffee', 6.5, 3.3, 5);

        Http::assertSent(function ($request): bool {
            return str_contains($request->url(), '/places/search')
                && ! array_key_exists('fields', $request->data());
        });

        config(['places.foursquare_premium_fields' => true]);
        Http::fake([
            'places-api.foursquare.com/*' => Http::response(['results' => []], 200),
        ]);

        $provider->search('coffee', 6.5, 3.3, 5);

        Http::assertSent(function ($request): bool {
            $data = $request->data();

            return str_contains($request->url(), '/places/search')
                && isset($data['fields'])
                && str_contains((string) $data['fields'], 'rating')
                && str_contains((string) $data['fields'], 'tel');
        });

        // Autocomplete stays lean even with premium on.
        Http::fake([
            'places-api.foursquare.com/*' => Http::response(['results' => []], 200),
        ]);
        $provider->autocomplete('coffee', 6.5, 3.3, 5);
        Http::assertSent(function ($request): bool {
            return str_contains($request->url(), '/autocomplete')
                && ! array_key_exists('fields', $request->data());
        });
    }
}
