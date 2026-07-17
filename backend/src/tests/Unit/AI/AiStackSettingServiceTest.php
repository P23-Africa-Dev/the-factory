<?php

declare(strict_types=1);

namespace Tests\Unit\AI;

use App\Models\Admin;
use App\Services\AI\AiStackSettingService;
use App\Services\AI\Providers\AiProviderRouter;
use App\Services\AI\Providers\ClaudeProvider;
use App\Services\AI\Providers\NvidiaProvider;
use App\Services\AI\Providers\OpenAiProvider;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use ReflectionMethod;
use Tests\TestCase;

final class AiStackSettingServiceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        config([
            'services.ai.stack' => 'openai_claude',
            'services.ai.nvidia.api_key' => 'nvapi-test',
            'services.ai.openai.api_key' => 'sk-test',
            'services.ai.claude.api_key' => 'sk-ant-test',
        ]);
    }

    public function test_defaults_to_openai_claude_stack(): void
    {
        $service = app(AiStackSettingService::class);

        $this->assertSame(AiStackSettingService::OPENAI_CLAUDE, $service->getStack());
        $this->assertTrue($service->isOpenAiClaude());
        $this->assertFalse($service->isNvidia());
    }

    public function test_set_stack_persists_and_clears_inactive_health_cache(): void
    {
        Cache::put(AiProviderHealthServiceCacheKeys::openai(), ['ok' => false, 'status' => 'quota_exceeded'], 600);
        Cache::put(AiProviderHealthServiceCacheKeys::claude(), ['ok' => false, 'status' => 'quota_exceeded'], 600);

        $admin = Admin::create([
            'name' => 'Super Admin',
            'email' => 'ai-stack@example.com',
            'password' => 'StrongPass123!',
            'role' => 'super_admin',
            'is_active' => true,
        ]);

        $service = app(AiStackSettingService::class);
        $service->setStack(AiStackSettingService::NVIDIA, $admin);

        $this->assertSame(AiStackSettingService::NVIDIA, $service->getStack());
        $this->assertDatabaseHas('platform_settings', [
            'key' => 'ai.stack',
            'value' => 'nvidia',
            'updated_by_admin_id' => $admin->id,
        ]);
        $this->assertNull(Cache::get(AiProviderHealthServiceCacheKeys::openai()));
        $this->assertNull(Cache::get(AiProviderHealthServiceCacheKeys::claude()));
    }

    public function test_router_uses_only_nvidia_when_nvidia_stack_active(): void
    {
        $admin = Admin::create([
            'name' => 'Super Admin',
            'email' => 'ai-router@example.com',
            'password' => 'StrongPass123!',
            'role' => 'super_admin',
            'is_active' => true,
        ]);

        app(AiStackSettingService::class)->setStack(AiStackSettingService::NVIDIA, $admin);

        $router = app(AiProviderRouter::class);
        $providers = $this->invokeOrderedProviders($router, 'operational');

        $this->assertCount(1, $providers);
        $this->assertInstanceOf(NvidiaProvider::class, $providers[0]);
    }

    public function test_router_excludes_nvidia_on_openai_claude_stack(): void
    {
        $router = app(AiProviderRouter::class);
        $providers = $this->invokeOrderedProviders($router, 'operational');

        $this->assertNotEmpty($providers);
        foreach ($providers as $provider) {
            $this->assertNotInstanceOf(NvidiaProvider::class, $provider);
            $this->assertTrue(
                $provider instanceof OpenAiProvider || $provider instanceof ClaudeProvider
            );
        }
    }

    /**
     * @return array<int, object>
     */
    private function invokeOrderedProviders(AiProviderRouter $router, string $purpose): array
    {
        $method = new ReflectionMethod(AiProviderRouter::class, 'orderedProviders');
        $method->setAccessible(true);

        return $method->invoke($router, $purpose, []);
    }
}

/**
 * Tiny helper so tests do not hard-code private const strings incorrectly.
 */
final class AiProviderHealthServiceCacheKeys
{
    public static function openai(): string
    {
        return 'ai:provider:status:openai';
    }

    public static function claude(): string
    {
        return 'ai:provider:status:claude';
    }
}
