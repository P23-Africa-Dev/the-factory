<?php

declare(strict_types=1);

namespace Tests\Feature\Internal;

use Tests\TestCase;

class CurrencyApiTest extends TestCase
{
    public function test_currencies_endpoint_returns_supported_currency_options(): void
    {
        $response = $this->getJson('/api/v1/currencies');

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'message' => 'Supported currencies fetched successfully.',
                'errors' => null,
            ])
            ->assertJsonStructure([
                'data' => [
                    'currencies' => [
                        '*' => ['code', 'name', 'symbol', 'label'],
                    ],
                    'default_currency',
                ],
            ]);

        $currencyCodes = array_column((array) $response->json('data.currencies'), 'code');

        $this->assertContains('NGN', $currencyCodes);
        $this->assertContains('USD', $currencyCodes);
        $this->assertContains('GBP', $currencyCodes);
    }

    public function test_currencies_endpoint_uses_supported_default_currency_fallback(): void
    {
        config(['currency.default' => 'XYZ']);

        $response = $this->getJson('/api/v1/currencies');

        $response->assertOk()
            ->assertJsonPath('data.default_currency', 'USD');
    }
}
