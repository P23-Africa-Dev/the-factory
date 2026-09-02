<?php

declare(strict_types=1);

namespace Tests\Unit\AI;

use App\Models\AiLog;
use App\Services\AI\Providers\AiProviderRouter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class AiProviderRouterInvocationTest extends TestCase
{
    use RefreshDatabase;

    public function test_failover_records_winning_claude_provider_and_model_in_ai_logs(): void
    {
        config([
            'services.ai.provider' => 'openai',
            'services.ai.fallback_provider' => 'claude',
            'services.ai.exec_model' => 'auto',
            'services.ai.openai.api_key' => 'openai-key',
            'services.ai.claude.api_key' => 'claude-key',
        ]);

        Http::fake([
            'api.openai.com/*' => Http::response(['error' => 'server_error'], 500),
            'api.anthropic.com/v1/messages' => Http::response([
                'model' => 'claude-sonnet-4-20250514',
                'content' => [['type' => 'text', 'text' => 'Claude failover response']],
                'usage' => ['input_tokens' => 11, 'output_tokens' => 9],
            ], 200),
        ]);

        $result = app(AiProviderRouter::class)->generateForPurpose(
            purpose: 'operational',
            systemPrompt: 'You are helpful.',
            userPrompt: 'Summarize this.',
            options: [
                'company_id' => 1,
                '_log' => [
                    'company_id' => 1,
                    'user_id' => 2,
                    'intent_type' => 'general',
                    'routing_purpose' => 'operational',
                    'user_prompt' => 'Summarize this.',
                ],
            ],
        );

        $this->assertNotNull($result);
        $this->assertSame('claude', $result->provider);
        $this->assertSame('claude-sonnet-4-20250514', $result->model);
        $this->assertSame('openai', $result->failoverFrom);

        $log = AiLog::query()->where('status', 'success')->latest('id')->first();
        $this->assertNotNull($log);
        $this->assertSame('claude', $log->provider);
        $this->assertSame('claude-sonnet-4-20250514', $log->model);
        $this->assertSame(20, $log->total_tokens);
    }

    public function test_demo_invocation_logs_demo_provider_and_mock_model(): void
    {
        $company = \App\Models\Company::query()->create([
            'company_id' => 'FAC-DEMOTST1',
            'name' => 'Demo Test Org',
            'country' => 'GB',
            'team_size' => '11-50',
            'use_case' => 'Demo',
            'status' => 'active',
            'is_demo' => true,
            'activated_at' => now(),
        ]);

        $result = app(AiProviderRouter::class)->generateForPurpose(
            purpose: 'operational',
            systemPrompt: 'You are helpful.',
            userPrompt: 'Hello demo',
            options: [
                'company_id' => (int) $company->id,
                '_log' => [
                    'company_id' => (int) $company->id,
                    'user_id' => 1,
                    'intent_type' => 'general',
                    'routing_purpose' => 'operational',
                    'user_prompt' => 'Hello demo',
                ],
            ],
        );

        $this->assertNotNull($result);
        $this->assertSame('demo', $result->provider);
        $this->assertSame('mock-ely', $result->model);

        $log = AiLog::query()->first();
        $this->assertNotNull($log);
        $this->assertSame('demo', $log->provider);
        $this->assertSame('mock-ely', $log->model);
        $this->assertSame(0.0, (float) $log->estimated_cost_usd);
    }
}
