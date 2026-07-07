<?php

declare(strict_types=1);

namespace Tests\Unit\AI;

use App\Services\AI\IntentClassifier;
use App\Services\AI\LlmIntentRouter;
use App\Services\AI\Policy\ToolPolicyService;
use App\Services\AI\Providers\AiGenerationResult;
use App\Services\AI\Providers\AiProviderRouter;
use Mockery;
use Tests\TestCase;

final class LlmIntentRouterTest extends TestCase
{
    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    public function test_parses_router_json_into_tool_intent(): void
    {
        $mockRouter = Mockery::mock(AiProviderRouter::class);
        $mockRouter->shouldReceive('generateForPurpose')
            ->once()
            ->andReturn(new AiGenerationResult(
                text: '{"intent":"tool","tool":"tasks.overdue","confidence":0.91,"extracted_entities":{"timeframe":"today"}}',
                provider: 'openai',
                model: 'gpt-4.1-mini',
                purpose: 'routing',
            ));

        $service = new LlmIntentRouter($mockRouter, new ToolPolicyService());
        $route = $service->route('anything overdue right now?', 'admin');

        $this->assertNotNull($route);
        $this->assertSame('tool', $route['type']);
        $this->assertSame('tasks.overdue', $route['tool']);
        $this->assertGreaterThanOrEqual(0.9, $route['confidence']);
    }

    public function test_rejects_tool_not_allowed_for_role(): void
    {
        $mockRouter = Mockery::mock(AiProviderRouter::class);
        $mockRouter->shouldReceive('generateForPurpose')
            ->once()
            ->andReturn(new AiGenerationResult(
                text: '{"intent":"tool","tool":"tracking.active_agents","confidence":0.95,"extracted_entities":{}}',
                provider: 'openai',
                model: 'gpt-4.1-mini',
                purpose: 'routing',
            ));

        $service = new LlmIntentRouter($mockRouter, new ToolPolicyService());
        $route = $service->route('where are agents?', 'agent');

        $this->assertNotNull($route);
        $this->assertSame('chat', $route['type']);
        $this->assertNull($route['tool']);
    }

    public function test_intent_classifier_matches_common_paraphrases(): void
    {
        $classifier = new IntentClassifier();

        $cases = [
            ['What is overdue?', 'tool', 'tasks.overdue'],
            ['Plan my day', 'tool', 'planning.daily'],
            ['Who should I follow up with?', 'tool', 'crm.follow_up_summary'],
            ['Create KPI for retailer visits', 'action', 'kpis.create'],
        ];

        foreach ($cases as [$message, $type, $tool]) {
            $intent = $classifier->classify($message);
            $this->assertSame($type, $intent['type'], "Failed type for: {$message}");
            $this->assertSame($tool, $intent['tool'], "Failed tool for: {$message}");
        }
    }
}
