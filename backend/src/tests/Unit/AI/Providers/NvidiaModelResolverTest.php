<?php

declare(strict_types=1);

namespace Tests\Unit\AI\Providers;

use App\Services\AI\Providers\NvidiaModelResolver;
use Tests\TestCase;

final class NvidiaModelResolverTest extends TestCase
{
    public function test_defaults_use_live_hosted_catalog_models(): void
    {
        config([
            'services.ai.nvidia.exec_model' => '',
            'services.ai.nvidia.routing_model' => '',
            'services.ai.nvidia.analyst_model' => '',
        ]);

        $resolver = app(NvidiaModelResolver::class);

        $this->assertSame('nvidia/llama-3.3-nemotron-super-49b-v1.5', $resolver->resolve('operational'));
        $this->assertSame('meta/llama-3.1-8b-instruct', $resolver->resolve('routing'));
        $this->assertSame('nvidia/llama-3.3-nemotron-super-49b-v1.5', $resolver->resolve('analyst'));
    }

    public function test_configured_exec_model_override_is_respected(): void
    {
        config([
            'services.ai.nvidia.exec_model' => 'meta/llama-3.3-70b-instruct',
            'services.ai.nvidia.analyst_model' => '',
        ]);

        $resolver = app(NvidiaModelResolver::class);

        $this->assertSame(
            'meta/llama-3.3-70b-instruct',
            $resolver->resolve('operational'),
        );
        $this->assertSame(
            'nvidia/llama-3.3-nemotron-super-49b-v1.5',
            $resolver->resolve('analyst'),
        );
    }

    public function test_latency_config_keys_are_present_with_sane_defaults(): void
    {
        $this->assertGreaterThanOrEqual(120000, (int) config('services.ai.nvidia.request_timeout_ms'));
        $this->assertLessThanOrEqual(1000, (int) config('services.ai.nvidia.operational_max_tokens'));
        $this->assertNotSame('', trim((string) config('services.ai.nvidia.exec_model')));
        $this->assertFalse((bool) config('services.ai.nvidia.enable_thinking'));
    }
}
