<?php

declare(strict_types=1);

namespace Tests\Unit\AI;

use App\Models\AiLog;
use App\Services\AI\AiLoggingService;
use App\Services\AI\Providers\AiGenerationResult;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class AiLoggingServiceInvocationTest extends TestCase
{
    use RefreshDatabase;

    public function test_record_invocation_never_persists_auto_as_model(): void
    {
        $service = app(AiLoggingService::class);

        $log = $service->recordInvocation(
            new AiGenerationResult(
                text: 'Hello from AI',
                provider: 'openai',
                model: 'auto',
                purpose: 'operational',
                inputTokens: 12,
                outputTokens: 8,
            ),
            [
                'company_id' => 1,
                'user_id' => 2,
                'intent_type' => 'inference',
                'tool_name' => 'test.tool',
                'routing_purpose' => 'operational',
                'user_prompt' => 'Test prompt',
            ],
        );

        $this->assertNotSame('auto', $log->fresh()->model);
        $this->assertSame('openai', $log->fresh()->provider);
        $this->assertSame(20, $log->fresh()->total_tokens);
        $this->assertTrue((bool) $log->fresh()->llm_invoked);
        $this->assertDatabaseCount('ai_logs', 1);
        $this->assertSame(1, AiLog::query()->llmInvocations()->count());
    }

    public function test_complete_normalizes_auto_model_from_begin(): void
    {
        $service = app(AiLoggingService::class);

        $log = $service->begin(
            companyId: null,
            userId: null,
            sessionId: null,
            provider: 'claude',
            model: 'auto',
            userPrompt: 'prompt',
            sanitizedPrompt: 'prompt',
            routingPurpose: 'operational',
        );

        $service->complete($log, 5, 7, 'claude', 'auto');

        $fresh = AiLog::query()->findOrFail($log->id);
        $this->assertNotSame('auto', $fresh->model);
        $this->assertSame('claude', $fresh->provider);
    }
}
