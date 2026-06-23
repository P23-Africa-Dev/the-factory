<?php

declare(strict_types=1);

namespace Tests\Unit\AI;

use App\Services\AI\Providers\AiProviderRouter;
use App\Services\AI\Providers\ClaudeProvider;
use App\Services\AI\Providers\OpenAiProvider;
use Tests\TestCase;

final class AiProviderRouterPurposeTest extends TestCase
{
    public function test_resolve_model_for_operational_uses_exec_model(): void
    {
        config([
            'services.ai.exec_model' => 'gpt-test-exec',
            'services.ai.analyst_model' => 'claude-test-analyst',
        ]);

        $router = new AiProviderRouter(
            $this->createMock(OpenAiProvider::class),
            $this->createMock(ClaudeProvider::class),
            $this->createMock(\App\Services\AI\Admin\AiFailoverTracker::class),
        );

        $reflection = new \ReflectionClass($router);
        $method = $reflection->getMethod('resolveModelForPurpose');
        $method->setAccessible(true);

        $this->assertSame('gpt-test-exec', $method->invoke($router, 'operational'));
        $this->assertSame('claude-test-analyst', $method->invoke($router, 'report'));
    }
}
