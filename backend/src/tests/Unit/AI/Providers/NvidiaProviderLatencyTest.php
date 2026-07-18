<?php

declare(strict_types=1);

namespace Tests\Unit\AI\Providers;

use App\Services\AI\Providers\NvidiaModelResolver;
use App\Services\AI\Providers\NvidiaProvider;
use Illuminate\Http\Client\Factory as HttpFactory;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Request;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Mockery;
use Tests\TestCase;

final class NvidiaProviderLatencyTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config([
            'services.ai.request_timeout_ms' => 30000,
            'services.ai.max_tokens' => 4000,
            'services.ai.nvidia.api_key' => 'nvapi-test',
            'services.ai.nvidia.base_url' => 'https://integrate.api.nvidia.com/v1',
            'services.ai.nvidia.request_timeout_ms' => 120000,
            'services.ai.nvidia.routing_timeout_ms' => 15000,
            'services.ai.nvidia.operational_timeout_ms' => 60000,
            'services.ai.nvidia.analyst_timeout_ms' => 120000,
            'services.ai.nvidia.operational_max_tokens' => 1000,
            'services.ai.nvidia.exec_model' => 'nvidia/llama-3.1-nemotron-nano-8b-v1',
            'services.ai.nvidia.analyst_model' => 'nvidia/llama-3.1-nemotron-ultra-253b-v1',
        ]);
    }

    public function test_operational_chat_caps_max_tokens_and_uses_nano_exec_model(): void
    {
        Http::fake([
            'integrate.api.nvidia.com/*' => Http::response([
                'choices' => [
                    ['message' => ['content' => 'Short NVIDIA reply.']],
                ],
                'model' => 'nvidia/llama-3.1-nemotron-nano-8b-v1',
                'usage' => ['prompt_tokens' => 12, 'completion_tokens' => 4],
            ], 200),
        ]);

        $result = app(NvidiaProvider::class)->generateText('You are ELY.', 'Say hello', [
            'purpose' => 'operational',
            'max_tokens' => 4000,
        ]);

        $this->assertNotNull($result);
        $this->assertTrue($result->isSuccessful());
        $this->assertSame('nvidia/llama-3.1-nemotron-nano-8b-v1', $result->model);

        Http::assertSent(function (Request $request) {
            $data = $request->data();

            return str_contains($request->url(), 'integrate.api.nvidia.com')
                && ($data['model'] ?? null) === 'nvidia/llama-3.1-nemotron-nano-8b-v1'
                && (int) ($data['max_tokens'] ?? 0) === 1000;
        });
    }

    public function test_analyst_purpose_does_not_apply_operational_token_cap(): void
    {
        Http::fake([
            'integrate.api.nvidia.com/*' => Http::response([
                'choices' => [
                    ['message' => ['content' => 'Long analyst reply.']],
                ],
                'model' => 'nvidia/llama-3.1-nemotron-ultra-253b-v1',
                'usage' => ['prompt_tokens' => 20, 'completion_tokens' => 40],
            ], 200),
        ]);

        $result = app(NvidiaProvider::class)->generateText('You are ELY.', 'Write a report', [
            'purpose' => 'analyst',
            'max_tokens' => 4000,
        ]);

        $this->assertNotNull($result);
        $this->assertTrue($result->isSuccessful());

        Http::assertSent(function (Request $request) {
            $data = $request->data();

            return ($data['model'] ?? null) === 'nvidia/llama-3.1-nemotron-ultra-253b-v1'
                && (int) ($data['max_tokens'] ?? 0) === 4000;
        });
    }

    public function test_routing_uses_short_timeout_and_operational_uses_sixty_seconds(): void
    {
        $okBody = json_encode([
            'choices' => [
                ['message' => ['content' => 'ok']],
            ],
            'model' => 'nvidia/llama-3.1-nemotron-nano-8b-v1',
            'usage' => ['prompt_tokens' => 1, 'completion_tokens' => 1],
        ], JSON_THROW_ON_ERROR);

        $routingPending = Mockery::mock(PendingRequest::class);
        $routingPending->shouldReceive('connectTimeout')->once()->with(15)->andReturnSelf();
        $routingPending->shouldReceive('withToken')->once()->with('nvapi-test')->andReturnSelf();
        $routingPending->shouldReceive('post')->once()->andReturn(
            new Response(new \GuzzleHttp\Psr7\Response(200, ['Content-Type' => 'application/json'], $okBody)),
        );

        $operationalPending = Mockery::mock(PendingRequest::class);
        $operationalPending->shouldReceive('connectTimeout')->once()->with(15)->andReturnSelf();
        $operationalPending->shouldReceive('withToken')->once()->with('nvapi-test')->andReturnSelf();
        $operationalPending->shouldReceive('post')->once()->andReturn(
            new Response(new \GuzzleHttp\Psr7\Response(200, ['Content-Type' => 'application/json'], $okBody)),
        );

        $http = Mockery::mock(HttpFactory::class);
        $http->shouldReceive('timeout')->once()->with(15)->andReturn($routingPending);
        $http->shouldReceive('timeout')->once()->with(60)->andReturn($operationalPending);

        $provider = new NvidiaProvider($http, app(NvidiaModelResolver::class));

        $this->assertTrue(
            $provider->generateText('sys', 'user', ['purpose' => 'routing'])->isSuccessful()
        );
        $this->assertTrue(
            $provider->generateText('sys', 'user', ['purpose' => 'operational'])->isSuccessful()
        );
    }
}
