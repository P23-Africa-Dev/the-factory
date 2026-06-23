<?php

declare(strict_types=1);

namespace Tests\Unit\AI\Providers;

use App\Services\AI\Providers\ClaudeModelResolver;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class ClaudeModelResolverTest extends TestCase
{
    public function test_auto_mode_selects_sonnet_from_available_models(): void
    {
        config([
            'services.ai.claude.api_key' => 'test-key',
            'services.ai.claude.model' => 'auto',
            'services.ai.analyst_model' => 'auto',
        ]);

        Http::fake([
            'api.anthropic.com/v1/models' => Http::response([
                'data' => [
                    ['id' => 'claude-haiku-4-5-20251001'],
                    ['id' => 'claude-sonnet-4-6'],
                    ['id' => 'claude-fable-5'],
                ],
            ], 200),
        ]);

        $resolver = app(ClaudeModelResolver::class);
        $resolver->clearCache();

        $this->assertSame('claude-sonnet-4-6', $resolver->resolve('analyst'));
    }

    public function test_explicit_model_is_not_overridden(): void
    {
        config([
            'services.ai.claude.api_key' => 'test-key',
            'services.ai.claude.model' => 'auto',
        ]);

        $resolver = app(ClaudeModelResolver::class);

        $this->assertSame('claude-haiku-4-5-20251001', $resolver->resolve('default', 'claude-haiku-4-5-20251001'));
    }
}
