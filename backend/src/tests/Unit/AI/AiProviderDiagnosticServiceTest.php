<?php

declare(strict_types=1);

namespace Tests\Unit\AI;

use App\Services\AI\Admin\AiProviderDiagnosticService;
use App\Services\AI\Admin\AiProviderHealthService;
use App\Services\AI\IntentClassifier;
use App\Services\AI\Providers\AiGenerationResult;
use App\Services\AI\Providers\AiProviderRouter;
use Mockery;
use Tests\TestCase;

final class AiProviderDiagnosticServiceTest extends TestCase
{
    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    public function test_diagnostic_report_includes_health_completion_and_intent_smoke(): void
    {
        config([
            'services.ai.openai.api_key' => 'test-openai',
            'services.ai.claude.api_key' => 'test-claude',
            'services.ai.nvidia.api_key' => 'test-nvidia',
            'services.ai.glm.api_key' => 'test-glm',
        ]);

        $health = Mockery::mock(AiProviderHealthService::class);
        $health->shouldReceive('checkAll')->once()->andReturn([
            'openai' => ['ok' => true, 'label' => 'Connected'],
            'claude' => ['ok' => false, 'label' => 'Credits Exhausted'],
            'nvidia' => ['ok' => true, 'label' => 'Connected'],
            'glm' => ['ok' => true, 'label' => 'Connected'],
        ]);

        $router = Mockery::mock(AiProviderRouter::class);
        $router->shouldReceive('generateForPurpose')
            ->times(4)
            ->andReturn(
                new AiGenerationResult(text: 'pong', provider: 'openai', model: 'gpt-4.1-mini', purpose: 'operational'),
                AiGenerationResult::failure('claude', 'claude-haiku', 'quota_exceeded', 'Credits exhausted.'),
                new AiGenerationResult(text: 'pong', provider: 'nvidia', model: 'nvidia/test', purpose: 'operational'),
                new AiGenerationResult(text: 'pong', provider: 'glm', model: 'glm-4-air', purpose: 'operational'),
            );

        $service = new AiProviderDiagnosticService(
            $health,
            $router,
            new IntentClassifier(),
        );

        $report = $service->run(simulateFailover: false);

        $this->assertArrayHasKey('health', $report);
        $this->assertArrayHasKey('completions', $report);
        $this->assertTrue($report['completions']['openai']['ok']);
        $this->assertFalse($report['completions']['claude']['ok']);
        $this->assertNotEmpty($report['intent_smoke']);
    }
}
