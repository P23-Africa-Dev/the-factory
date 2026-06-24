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
            'api.openai.com/v1/models' => Http::response(['data' => [['id' => 'gpt-4.1-mini']]], 200),
        ]);

        $service = app(AiProviderHealthService::class);
        $result = $service->checkOpenAi(persist: true);

        $this->assertTrue($result['ok']);
        $this->assertSame('connected', $result['status']);
        $this->assertNotNull(Cache::get(AiProviderHealthService::CACHE_KEY_OPENAI));
    }

    public function test_openai_auth_failure_maps_to_auth_failed(): void
    {
        config(['services.ai.openai.api_key' => 'bad-key']);

        Http::fake([
            'api.openai.com/v1/models' => Http::response([], 401),
        ]);

        $result = app(AiProviderHealthService::class)->checkOpenAi(persist: false);

        $this->assertFalse($result['ok']);
        $this->assertSame('auth_failed', $result['status']);
    }
}
