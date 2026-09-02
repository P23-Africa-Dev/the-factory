<?php

declare(strict_types=1);

namespace Tests\Feature\Geography;

use Tests\TestCase;

class GeographyApiTest extends TestCase
{
    public function test_states_endpoint_returns_nigeria_states(): void
    {
        $response = $this->getJson('/api/v1/geography/states?country_code=NG');

        $response->assertOk()
            ->assertJsonPath('data.supported', true);

        $states = $response->json('data.states');
        $this->assertContains('Lagos', $states);
        $this->assertContains('FCT', $states);
    }

    public function test_lgas_endpoint_returns_lagos_lgas(): void
    {
        $response = $this->getJson('/api/v1/geography/lgas?country_code=NG&state_name=Lagos');

        $response->assertOk()
            ->assertJsonPath('data.supported', true);

        $lgas = $response->json('data.lgas');
        $this->assertContains('Ikeja', $lgas);
        $this->assertContains('Eti-Osa', $lgas);
        $this->assertContains('Lagos Island', $lgas);
    }

    public function test_states_endpoint_returns_empty_for_unsupported_country(): void
    {
        $response = $this->getJson('/api/v1/geography/states?country_code=FR');

        $response->assertOk()
            ->assertJsonPath('data.supported', false)
            ->assertJsonPath('data.states', []);
    }
}
