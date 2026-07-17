<?php

declare(strict_types=1);

namespace Tests\Unit\AI\Providers;

use App\Services\AI\Providers\NvidiaModelResolver;
use Tests\TestCase;

final class NvidiaModelResolverTest extends TestCase
{
    public function test_operational_default_is_nano_class_model(): void
    {
        config([
            'services.ai.nvidia.exec_model' => '',
            'services.ai.nvidia.routing_model' => '',
            'services.ai.nvidia.analyst_model' => '',
        ]);

        $resolver = app(NvidiaModelResolver::class);

        $this->assertSame('nvidia/llama-3.1-nemotron-nano-8b-v1', $resolver->resolve('operational'));
        $this->assertSame('nvidia/llama-3.1-nemotron-nano-8b-v1', $resolver->resolve('routing'));
        $this->assertSame('nvidia/llama-3.1-nemotron-ultra-253b-v1', $resolver->resolve('analyst'));
    }

    public function test_configured_exec_model_override_is_respected(): void
    {
        config([
            'services.ai.nvidia.exec_model' => 'nvidia/llama-3.3-nemotron-super-49b-v1.5',
        ]);

        $resolver = app(NvidiaModelResolver::class);

        $this->assertSame(
            'nvidia/llama-3.3-nemotron-super-49b-v1.5',
            $resolver->resolve('operational'),
        );
        $this->assertSame(
            'nvidia/llama-3.1-nemotron-ultra-253b-v1',
            $resolver->resolve('analyst'),
        );
    }

    public function test_latency_config_keys_are_present_with_sane_defaults(): void
    {
        $this->assertGreaterThanOrEqual(120000, (int) config('services.ai.nvidia.request_timeout_ms'));
        $this->assertLessThanOrEqual(1000, (int) config('services.ai.nvidia.operational_max_tokens'));
        $this->assertNotSame('', trim((string) config('services.ai.nvidia.exec_model')));
    }
}
