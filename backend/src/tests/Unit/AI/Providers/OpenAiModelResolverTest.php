<?php

declare(strict_types=1);

namespace Tests\Unit\AI\Providers;

use App\Services\AI\Providers\OpenAiModelResolver;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class OpenAiModelResolverTest extends TestCase
{
    public function test_auto_mode_selects_operational_mini_from_available_models(): void
    {
        config([
            'services.ai.openai.api_key' => 'test-key',
            'services.ai.openai.model' => 'auto',
            'services.ai.exec_model' => 'auto',
            'services.ai.default_model' => 'auto',
        ]);

        Http::fake([
            'api.openai.com/v1/models' => Http::response([
                'data' => [
                    ['id' => 'text-embedding-3-small'],
                    ['id' => 'whisper-1'],
                    ['id' => 'gpt-4o-mini'],
                    ['id' => 'gpt-4.1-mini'],
                    ['id' => 'gpt-4.1'],
                ],
            ], 200),
        ]);

        $resolver = app(OpenAiModelResolver::class);
        $resolver->clearCache();

        $this->assertSame('gpt-4.1-mini', $resolver->resolve('operational'));
    }

    public function test_auto_mode_selects_analyst_tier_model(): void
    {
        config([
            'services.ai.openai.api_key' => 'test-key',
            'services.ai.openai.model' => 'auto',
            'services.ai.analyst_model' => 'auto',
        ]);

        Http::fake([
            'api.openai.com/v1/models' => Http::response([
                'data' => [
                    ['id' => 'gpt-4o-mini'],
                    ['id' => 'gpt-4.1-mini'],
                    ['id' => 'gpt-4.1'],
                    ['id' => 'gpt-4o'],
                ],
            ], 200),
        ]);

        $resolver = app(OpenAiModelResolver::class);
        $resolver->clearCache();

        $this->assertSame('gpt-4.1', $resolver->resolve('analyst'));
    }

    public function test_explicit_model_is_not_overridden(): void
    {
        config([
            'services.ai.openai.api_key' => 'test-key',
            'services.ai.openai.model' => 'auto',
        ]);

        $resolver = app(OpenAiModelResolver::class);

        $this->assertSame('gpt-4o-mini', $resolver->resolve('default', 'gpt-4o-mini'));
    }
}
