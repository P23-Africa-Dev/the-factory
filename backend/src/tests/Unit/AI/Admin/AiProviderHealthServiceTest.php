<?php

declare(strict_types=1);

namespace Tests\Unit\AI\Admin;

use App\Services\AI\Admin\AiProviderHealthService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class AiProviderHealthServiceTest extends TestCase
{
    public function test_openai_health_check_caches_success_timestamps(): void
    {
        Cache::forget(AiProviderHealthService::CACHE_KEY_OPENAI);
        config(['services.ai.openai.api_key' => 'test-key']);

        Http::fake([
            'api.openai.com/v1/chat/completions' => Http::response([
                'choices' => [['message' => ['content' => 'pong']]],
                'usage' => ['prompt_tokens' => 1, 'completion_tokens' => 1, 'total_tokens' => 2],
            ], 200),
        ]);

        $service = app(AiProviderHealthService::class);
        $result = $service->checkOpenAi(persist: true);

        $this->assertTrue($result['ok']);
        $this->assertSame('connected', $result['status']);
        $this->assertNotNull(Cache::get(AiProviderHealthService::CACHE_KEY_OPENAI));
    }

    public function test_openai_quota_failure_on_completion_maps_to_quota_exceeded(): void
    {
        config(['services.ai.openai.api_key' => 'test-key']);

        Http::fake([
            'api.openai.com/v1/chat/completions' => Http::response([
                'error' => [
                    'message' => 'You exceeded your current quota, please check your plan and billing details.',
                    'type' => 'insufficient_quota',
                    'code' => 'insufficient_quota',
                ],
            ], 429),
        ]);

        $result = app(AiProviderHealthService::class)->checkOpenAi(persist: false);

        $this->assertFalse($result['ok']);
        $this->assertSame('quota_exceeded', $result['status']);
        $this->assertSame('Credits Exhausted', $result['label']);
    }

    public function test_openai_auth_failure_maps_to_auth_failed(): void
    {
        config(['services.ai.openai.api_key' => 'bad-key']);

        Http::fake([
            'api.openai.com/v1/chat/completions' => Http::response([], 401),
        ]);

        $result = app(AiProviderHealthService::class)->checkOpenAi(persist: false);

        $this->assertFalse($result['ok']);
        $this->assertSame('auth_failed', $result['status']);
    }

    public function test_presentation_marks_quota_exhausted_as_error_state(): void
    {
        $service = app(AiProviderHealthService::class);
        $presentation = $service->presentation([
            'ok' => false,
            'status' => 'quota_exceeded',
            'label' => 'Credits Exhausted',
            'message' => 'Billing limit reached.',
        ]);

        $this->assertSame('status-error', $presentation['card_class']);
        $this->assertSame('error', $presentation['pill_class']);
        $this->assertSame('Credits Exhausted', $presentation['label']);
    }

    public function test_aggregate_status_is_degraded_when_only_one_provider_is_healthy(): void
    {
        $service = app(AiProviderHealthService::class);
        $aggregate = $service->aggregateStatus(
            openaiHealth: ['ok' => false, 'status' => 'quota_exceeded'],
            claudeHealth: ['ok' => true, 'status' => 'connected'],
            openaiConfigured: true,
            claudeConfigured: true,
            primaryProvider: 'openai',
            fallbackProvider: 'claude',
        );

        $this->assertSame('degraded', $aggregate['status']);
        $this->assertSame('Claude', $aggregate['active_provider']);
    }
}
