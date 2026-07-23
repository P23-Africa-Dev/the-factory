<?php

declare(strict_types=1);

namespace App\Services\AI\Admin;

use App\Services\AI\IntentClassifier;
use App\Services\AI\Providers\AiProviderRouter;
use Illuminate\Support\Facades\Http;

class AiProviderDiagnosticService
{
    public function __construct(
        private readonly AiProviderHealthService $healthService,
        private readonly AiProviderRouter $aiProviderRouter,
        private readonly IntentClassifier $intentClassifier,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function run(bool $simulateFailover = false): array
    {
        $health = $this->healthService->checkAll(persist: true);
        $completions = [
            'openai' => $this->probeCompletion('openai'),
            'claude' => $this->probeCompletion('claude'),
            'nvidia' => $this->probeCompletion('nvidia'),
            'glm' => $this->probeCompletion('glm'),
        ];
        $failover = $simulateFailover ? $this->probeFailover() : ['skipped' => true];
        $intentSmoke = $this->intentSmokeTests();

        return [
            'checked_at' => now()->toIso8601String(),
            'health' => $health,
            'completions' => $completions,
            'failover' => $failover,
            'intent_smoke' => $intentSmoke,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function probeCompletion(string $provider): array
    {
        $start = microtime(true);

        if ($provider === 'openai' && trim((string) config('services.ai.openai.api_key')) === '') {
            return $this->completionResult($provider, false, 'not_configured', 'No API key configured.', null, 0);
        }

        if ($provider === 'claude' && trim((string) config('services.ai.claude.api_key')) === '') {
            return $this->completionResult($provider, false, 'not_configured', 'No API key configured.', null, 0);
        }

        if ($provider === 'nvidia' && trim((string) config('services.ai.nvidia.api_key')) === '') {
            return $this->completionResult($provider, false, 'not_configured', 'No API key configured.', null, 0);
        }

        if ($provider === 'glm' && trim((string) config('services.ai.glm.api_key')) === '') {
            return $this->completionResult($provider, false, 'not_configured', 'No API key configured.', null, 0);
        }

        $result = $this->aiProviderRouter->generateForPurpose(
            purpose: 'operational',
            systemPrompt: 'You are a connectivity probe. Reply with exactly: pong',
            userPrompt: 'ping',
            options: [
                'max_tokens' => 8,
                'temperature' => 0,
                'force_provider' => $provider,
            ],
        );

        $latency = (int) round((microtime(true) - $start) * 1000);

        if ($result !== null && $result->isSuccessful()) {
            return $this->completionResult(
                $provider,
                true,
                'connected',
                'Completion succeeded.',
                $result->model,
                $latency,
                ['sample' => mb_substr((string) $result->text, 0, 80)],
            );
        }

        if ($result !== null && $result->isFailure()) {
            return $this->completionResult(
                $provider,
                false,
                (string) $result->errorClass,
                (string) $result->errorMessage,
                $result->model,
                $latency,
            );
        }

        return $this->completionResult($provider, false, 'error', 'Provider returned no result.', null, $latency);
    }

    /**
     * @return array<string, mixed>
     */
    private function probeFailover(): array
    {
        $primary = strtolower((string) config('services.ai.provider', 'openai'));
        $fallback = strtolower((string) config('services.ai.fallback_provider', 'claude'));

        Http::fake([
            'api.openai.com/*' => Http::response(['error' => ['message' => 'simulated failure']], 500),
            'api.anthropic.com/*' => Http::response([
                'content' => [['type' => 'text', 'text' => 'pong']],
                'model' => 'claude-test',
                'usage' => ['input_tokens' => 1, 'output_tokens' => 1],
            ], 200),
        ]);

        $result = $this->aiProviderRouter->generateForPurpose(
            purpose: 'operational',
            systemPrompt: 'Reply pong',
            userPrompt: 'ping',
            options: ['max_tokens' => 8, 'temperature' => 0],
        );

        Http::fake(); // reset

        if ($result !== null && $result->isSuccessful()) {
            return [
                'ok' => true,
                'primary' => $primary,
                'fallback' => $fallback,
                'provider' => $result->provider,
                'failover_from' => $result->failoverFrom,
            ];
        }

        return [
            'ok' => false,
            'primary' => $primary,
            'fallback' => $fallback,
            'message' => 'Failover simulation did not produce a successful response.',
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function intentSmokeTests(): array
    {
        $prompts = [
            ['prompt' => 'Create me a meeting with Agent Elijah tomorrow at 12pm', 'expected_tool' => 'meetings.schedule', 'expected_type' => 'action'],
            ['prompt' => 'Create KPI for retailer visits, assign to John', 'expected_tool' => 'kpis.create', 'expected_type' => 'action'],
            ['prompt' => 'What is overdue?', 'expected_tool' => 'tasks.overdue', 'expected_type' => 'tool'],
            ['prompt' => 'Who should I follow up with?', 'expected_tool' => 'crm.follow_up_summary', 'expected_type' => 'tool'],
            ['prompt' => 'Plan my day', 'expected_tool' => 'planning.daily', 'expected_type' => 'tool'],
            ['prompt' => 'Show stale leads', 'expected_tool' => 'crm.stale_leads', 'expected_type' => 'tool'],
            ['prompt' => 'List my CRM leads', 'expected_tool' => 'crm.top_leads', 'expected_type' => 'tool'],
            ['prompt' => 'How is the team performing?', 'expected_tool' => 'kpi.team_performance', 'expected_type' => 'tool'],
        ];

        $rows = [];
        foreach ($prompts as $case) {
            $intent = $this->intentClassifier->classify((string) $case['prompt']);
            $rows[] = [
                'prompt' => $case['prompt'],
                'expected_type' => $case['expected_type'],
                'expected_tool' => $case['expected_tool'],
                'actual_type' => $intent['type'] ?? null,
                'actual_tool' => $intent['tool'] ?? null,
                'confidence' => $intent['confidence'] ?? null,
                'passed' => ($intent['type'] ?? null) === $case['expected_type']
                    && ($intent['tool'] ?? null) === $case['expected_tool'],
            ];
        }

        return $rows;
    }

    /**
     * @param  array<string, mixed>  $extra
     * @return array<string, mixed>
     */
    private function completionResult(
        string $provider,
        bool $ok,
        string $status,
        string $message,
        ?string $resolvedModel,
        int $latencyMs,
        array $extra = [],
    ): array {
        return array_merge([
            'provider' => $provider,
            'ok' => $ok,
            'status' => $status,
            'message' => $message,
            'resolved_model' => $resolvedModel,
            'latency_ms' => $latencyMs,
        ], $extra);
    }
}
