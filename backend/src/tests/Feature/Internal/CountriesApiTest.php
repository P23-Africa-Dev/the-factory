<?php

declare(strict_types=1);

namespace Tests\Feature\Internal;

use App\Support\CountryCatalog;
use Tests\TestCase;

class CountriesApiTest extends TestCase
{
    public function test_countries_endpoint_returns_full_country_names(): void
    {
        $response = $this->getJson('/api/v1/countries');

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'message' => 'Supported countries fetched successfully.',
                'errors' => null,
            ])
            ->assertJsonStructure([
                'data' => [
                    'countries' => [
                        '*' => ['label', 'value'],
                    ],
                ],
            ]);

        $countries = collect((array) $response->json('data.countries'));

        $this->assertGreaterThanOrEqual(200, $countries->count());

        $nigeria = $countries->firstWhere('value', 'Nigeria');
        $unitedKingdom = $countries->firstWhere('value', 'United Kingdom');

        $this->assertNotNull($nigeria);
        $this->assertSame('Nigeria', $nigeria['label']);
        $this->assertSame('Nigeria', $nigeria['value']);
        $this->assertNotNull($unitedKingdom);
        $this->assertSame('United Kingdom', $unitedKingdom['value']);

        $countries->each(function (array $country): void {
            $this->assertSame($country['label'], $country['value']);
        });
    }

    public function test_country_catalog_resolves_names_and_codes(): void
    {
        $this->assertSame('Nigeria', CountryCatalog::resolveName('NG'));
        $this->assertSame('Nigeria', CountryCatalog::resolveName('Nigeria'));
        $this->assertSame('NG', CountryCatalog::resolveCode('Nigeria'));
        $this->assertSame('GB', CountryCatalog::resolveCode('United Kingdom'));
    }
}
