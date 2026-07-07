<?php

declare(strict_types=1);

namespace Tests\Unit\AI;

use App\Services\AI\Admin\AiProviderHealthService;
use App\Services\AI\Providers\AiProviderRouter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class AiProviderRouterHealthSkipTest extends TestCase
{
    use RefreshDatabase;

    public function test_router_skips_unhealthy_primary_provider(): void
    {
        config([
            'services.ai.provider' => 'openai',
            'services.ai.fallback_provider' => 'claude',
            'services.ai.provider_skip_ttl_seconds' => 300,
            'services.ai.openai.api_key' => 'openai-key',
            'services.ai.claude.api_key' => 'claude-key',
        ]);

        Cache::put(AiProviderHealthService::CACHE_KEY_OPENAI, [
            'provider' => 'openai',
            'ok' => false,
            'status' => 'quota_exceeded',
            'label' => 'Credits Exhausted',
            'message' => 'Billing limit reached.',
            'last_failed_at' => now()->toIso8601String(),
        ], 600);

        Http::fake([
            'api.anthropic.com/v1/messages' => Http::response([
                'model' => 'claude-haiku-4-5-20251001',
                'content' => [['type' => 'text', 'text' => 'Healthy fallback response']],
                'usage' => ['input_tokens' => 5, 'output_tokens' => 4],
            ], 200),
        ]);

        $result = app(AiProviderRouter::class)->generateForPurpose(
            purpose: 'operational',
            systemPrompt: 'You are helpful.',
            userPrompt: 'Say hello.',
            options: ['max_tokens' => 32],
        );

        $this->assertNotNull($result);
        $this->assertTrue($result->isSuccessful());
        $this->assertSame('claude', $result->provider);
    }
}
