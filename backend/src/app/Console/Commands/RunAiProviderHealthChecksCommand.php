<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\AI\Admin\AiOperationsAnalyticsService;
use App\Services\AI\Admin\AiProviderHealthService;
use Illuminate\Console\Command;

class RunAiProviderHealthChecksCommand extends Command
{
    protected $signature = 'ai:health-check';

    protected $description = 'Run scheduled AI provider connectivity health checks and sync admin alerts';

    public function handle(
        AiProviderHealthService $healthService,
        AiOperationsAnalyticsService $analyticsService,
    ): int {
        $results = $healthService->checkAll(persist: true);

        $this->info('OpenAI: ' . ($results['openai']['label'] ?? 'unknown'));
        $this->info('Claude: ' . ($results['claude']['label'] ?? 'unknown'));

        if ($this->aiLogsTableAvailable()) {
            $monthStart = now()->startOfMonth()->toDateTimeString();
            $monthCost = (float) \App\Models\AiLog::query()
                ->llmInvocations()
                ->where('created_at', '>=', $monthStart)
                ->sum('estimated_cost_usd');
            $analyticsService->checkSpendingAlert($monthCost);
        }

        return self::SUCCESS;
    }

    private function aiLogsTableAvailable(): bool
    {
        try {
            return \Illuminate\Support\Facades\Schema::hasTable('ai_logs');
        } catch (\Throwable) {
            return false;
        }
    }
}
