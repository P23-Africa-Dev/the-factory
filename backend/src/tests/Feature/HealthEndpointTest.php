<?php

namespace Tests\Feature;

use Tests\TestCase;

class HealthEndpointTest extends TestCase
{
    public function test_health_endpoint_returns_expected_json_payload(): void
    {
        $response = $this->getJson('/api/v1/health');

        $response
            ->assertOk()
            ->assertJsonStructure([
                'success',
                'message',
                'data' => [
                    'service',
                    'environment',
                    'timestamp',
                ],
                'errors',
            ])
            ->assertJson([
                'success' => true,
                'message' => 'API is healthy',
                'errors' => null,
            ]);
    }
}
