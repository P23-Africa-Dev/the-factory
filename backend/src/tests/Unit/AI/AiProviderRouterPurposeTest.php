<?php

declare(strict_types=1);

namespace Tests\Unit\AI;

use App\Services\AI\Providers\AiProviderRouter;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class AiProviderRouterPurposeTest extends TestCase
{
    public function test_resolve_model_for_operational_defaults_to_auto(): void
    {
        config([
            'services.ai.exec_model' => 'auto',
            'services.ai.analyst_model' => 'auto',
        ]);

        $router = app(AiProviderRouter::class);

        $reflection = new \ReflectionClass($router);
        $method = $reflection->getMethod('resolveModelForPurpose');
        $method->setAccessible(true);

        $this->assertSame('auto', $method->invoke($router, 'operational'));
        $this->assertSame('auto', $method->invoke($router, 'report'));
    }

    public function test_resolve_model_for_operational_uses_explicit_exec_model(): void
    {
        config([
            'services.ai.exec_model' => 'gpt-test-exec',
            'services.ai.analyst_model' => 'auto',
        ]);

        $router = app(AiProviderRouter::class);

        $reflection = new \ReflectionClass($router);
        $method = $reflection->getMethod('resolveModelForPurpose');
        $method->setAccessible(true);

        $this->assertSame('gpt-test-exec', $method->invoke($router, 'operational'));
    }

    public function test_routing_metadata_resolves_openai_model_when_auto(): void
    {
        config([
            'services.ai.provider' => 'openai',
            'services.ai.fallback_provider' => 'claude',
            'services.ai.exec_model' => 'auto',
            'services.ai.openai.api_key' => 'test-key',
            'services.ai.openai.model' => 'auto',
        ]);

        Http::fake([
            'api.openai.com/v1/models' => Http::response([
                'data' => [
                    ['id' => 'gpt-4o-mini'],
                    ['id' => 'gpt-4.1-mini'],
                ],
            ], 200),
        ]);

        app(\App\Services\AI\Providers\OpenAiModelResolver::class)->clearCache();

        $routing = app(AiProviderRouter::class)->routingMetadata('operational');

        $this->assertSame('operational', $routing['purpose']);
        $this->assertSame('openai', $routing['provider']);
        $this->assertSame('gpt-4.1-mini', $routing['model']);
    }
}
