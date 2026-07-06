<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\AI;

use App\Http\Controllers\Controller;
use App\Models\AiLog;
use App\Services\AI\Admin\AiAlertService;
use App\Services\AI\Admin\AiFailoverTracker;
use App\Services\AI\Admin\AiOperationsAnalyticsService;
use App\Services\AI\Admin\AiProviderHealthService;
use App\Services\AI\AiLoggingService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;
use Illuminate\View\View;
use Throwable;

class AiManagementController extends Controller
{
    public function __construct(
        private readonly AiLoggingService $aiLoggingService,
        private readonly AiProviderHealthService $healthService,
        private readonly AiFailoverTracker $failoverTracker,
        private readonly AiOperationsAnalyticsService $operationsAnalytics,
        private readonly AiAlertService $alertService,
    ) {}

    public function index(): View
    {
        $now = Carbon::now();
        $today = $now->toDateString();
        $sevenDaysAgo = $now->copy()->subDays(7)->toDateString();
        $thirtyDaysAgo = $now->copy()->subDays(30)->toDateString();
        $monthStart = $now->copy()->startOfMonth()->toDateTimeString();

        $aiLogsReady = $this->aiLogsTableAvailable();
        $statsToday = $this->emptyStats();
        $statsWeek = $this->emptyStats();
        $statsMonth = $this->emptyStats();
        $avgExecutionByProvider = ['openai' => null, 'claude' => null];
        $providerUsage = [
            'openai' => $this->emptyProviderUsage(),
            'claude' => $this->emptyProviderUsage(),
        ];
        $topUsers = [];
        $topOrganizations = [];
        $modelUsage = [];
        $modelUsageDetailed = [];
        $providerModelMatrix = [];
        $dailyTrends = [];
        $recentErrors = [];
        $recentLogs = collect();
        $last24hTotal = 0;
        $last24hFailed = 0;

        if ($aiLogsReady) {
            $statsToday = $this->aiLoggingService->analytics(null, $today . ' 00:00:00', $today . ' 23:59:59');
            $statsWeek = $this->aiLoggingService->analytics(null, $sevenDaysAgo . ' 00:00:00', $today . ' 23:59:59');
            $statsMonth = $this->aiLoggingService->analytics(null, $thirtyDaysAgo . ' 00:00:00', $today . ' 23:59:59');

            $avgExecutionByProvider['openai'] = AiLog::query()
                ->llmInvocations()
                ->where('provider', 'openai')
                ->where('created_at', '>=', $now->copy()->subDays(30))
                ->avg('execution_ms');
            $avgExecutionByProvider['claude'] = AiLog::query()
                ->llmInvocations()
                ->where('provider', 'claude')
                ->where('created_at', '>=', $now->copy()->subDays(30))
                ->avg('execution_ms');

            $providerUsage = $this->operationsAnalytics->providerUsage($today, $monthStart);
            $topUsers = $this->operationsAnalytics->topUsers($now->copy()->subDays(30));
            $topOrganizations = $this->operationsAnalytics->topOrganizations($now->copy()->subDays(30));
            $modelUsage = $this->operationsAnalytics->modelUsage($now->copy()->subDays(30));
            $modelUsageDetailed = $this->operationsAnalytics->modelUsageDetailed($now->copy()->subDays(30));
            $providerModelMatrix = $this->operationsAnalytics->providerModelMatrix($now->copy()->subDays(30));
            $dailyTrends = $this->operationsAnalytics->dailyTrends($now->copy()->subDays(29)->startOfDay(), $now);
            $recentErrors = $this->operationsAnalytics->recentErrors(10);

            $recentLogs = AiLog::query()
                ->llmInvocations()
                ->with(['user:id,name,email', 'company:id,name'])
                ->latest()
                ->limit(10)
                ->get();

            $last24hTotal = AiLog::query()->llmInvocations()->where('created_at', '>=', $now->copy()->subDay())->count();
            $last24hFailed = AiLog::query()->llmInvocations()->where('created_at', '>=', $now->copy()->subDay())
                ->whereIn('status', ['failed', 'timeout'])
                ->count();

            $this->operationsAnalytics->checkSpendingAlert((float) $statsMonth['estimated_cost_usd']);
        }

        $openaiConfigured = trim((string) config('services.ai.openai.api_key')) !== '';
        $claudeConfigured = trim((string) config('services.ai.claude.api_key')) !== '';
        $primaryProvider = (string) config('services.ai.provider', 'openai');
        $fallbackProvider = (string) config('services.ai.fallback_provider', 'claude');

        $openaiHealth = $this->healthService->displayStatus('openai');
        $claudeHealth = $this->healthService->displayStatus('claude');
        $warningBanners = $this->operationsAnalytics->warningBanners($openaiHealth, $claudeHealth);
        $activeAlerts = $this->alertService->activeAlerts(10);
        $lastFailover = $this->failoverTracker->latest();

        $errorRate = $last24hTotal > 0 ? round(($last24hFailed / $last24hTotal) * 100, 1) : 0;

        $aiStatus = 'online';
        if (! $openaiConfigured && ! $claudeConfigured) {
            $aiStatus = 'offline';
        } elseif (($openaiHealth['ok'] ?? false) === false && ($claudeHealth['ok'] ?? false) === false) {
            $aiStatus = 'offline';
        } elseif ($errorRate > 20 || (($openaiHealth['ok'] ?? false) === false xor ($claudeHealth['ok'] ?? false) === false)) {
            $aiStatus = 'degraded';
        } elseif ($lastFailover !== null) {
            $aiStatus = 'fallback';
        }

        $activeProviderLabel = ucfirst($primaryProvider);
        if (($openaiHealth['ok'] ?? false) === false && ($claudeHealth['ok'] ?? false) === true) {
            $activeProviderLabel = ucfirst($fallbackProvider);
        } elseif (($claudeHealth['ok'] ?? false) === false && ($openaiHealth['ok'] ?? false) === true) {
            $activeProviderLabel = ucfirst($primaryProvider);
        }

        return view('admin.ai.index', compact(
            'statsToday',
            'statsWeek',
            'statsMonth',
            'aiLogsReady',
            'openaiConfigured',
            'claudeConfigured',
            'primaryProvider',
            'fallbackProvider',
            'avgExecutionByProvider',
            'errorRate',
            'aiStatus',
            'last24hTotal',
            'last24hFailed',
            'openaiHealth',
            'claudeHealth',
            'warningBanners',
            'activeAlerts',
            'lastFailover',
            'providerUsage',
            'topUsers',
            'topOrganizations',
            'modelUsage',
            'modelUsageDetailed',
            'providerModelMatrix',
            'dailyTrends',
            'recentErrors',
            'recentLogs',
            'activeProviderLabel',
        ));
    }

    public function resolveAlert(int $alert): RedirectResponse
    {
        $this->alertService->resolve($alert);

        return redirect()->route('admin.ai.index')->with('status', 'Alert resolved.');
    }

    public function analytics(Request $request): View
    {
        $range = $request->input('range', '30');
        $now = Carbon::now();
        $aiLogsReady = $this->aiLogsTableAvailable();

        $from = match ($range) {
            '1' => $now->copy()->subDay(),
            '7' => $now->copy()->subDays(7),
            '90' => $now->copy()->subDays(90),
            '365' => $now->copy()->subDays(365),
            default => $now->copy()->subDays(30),
        };

        $stats = $this->emptyStats();
        $modelUsage = [];
        $modelUsageDetailed = [];
        $providerModelMatrix = [];
        $topUsers = [];
        $topOrganizations = [];

        if ($aiLogsReady) {
            $stats = $this->aiLoggingService->analytics(
                companyId: null,
                from: $from->toDateTimeString(),
                to: $now->toDateTimeString(),
            );
            $modelUsage = $this->operationsAnalytics->modelUsage($from);
            $modelUsageDetailed = $this->operationsAnalytics->modelUsageDetailed($from);
            $providerModelMatrix = $this->operationsAnalytics->providerModelMatrix($from);
            $topUsers = $this->operationsAnalytics->topUsers($from, 8);
            $topOrganizations = $this->operationsAnalytics->topOrganizations($from, 8);
        }

        $dailyData = collect();

        if ($aiLogsReady) {
            $dailyData = AiLog::query()
                ->llmInvocations()
                ->where('created_at', '>=', $from)
                ->selectRaw("DATE(created_at) as day, COUNT(*) as requests, SUM(COALESCE(total_tokens,0)) as tokens, SUM(COALESCE(estimated_cost_usd,0)) as cost, SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful, SUM(CASE WHEN status IN ('failed','timeout') THEN 1 ELSE 0 END) as failed")
                ->groupBy('day')
                ->orderBy('day')
                ->get()
                ->keyBy('day');
        }

        $days = [];
        $current = $from->copy();
        while ($current->lte($now)) {
            $key = $current->toDateString();
            $days[$key] = [
                'requests' => (int) ($dailyData[$key]->requests ?? 0),
                'tokens' => (int) ($dailyData[$key]->tokens ?? 0),
                'cost' => (float) ($dailyData[$key]->cost ?? 0),
                'successful' => (int) ($dailyData[$key]->successful ?? 0),
                'failed' => (int) ($dailyData[$key]->failed ?? 0),
            ];
            $current->addDay();
        }

        return view('admin.ai.analytics', compact(
            'stats',
            'days',
            'range',
            'aiLogsReady',
            'modelUsage',
            'modelUsageDetailed',
            'providerModelMatrix',
            'topUsers',
            'topOrganizations',
        ));
    }

    /**
     * @return array{total_requests:int,successful:int,failed:int,total_tokens:int,input_tokens:int,output_tokens:int,estimated_cost_usd:float,avg_execution_ms:float|null,by_provider:array<string, array{requests:int,tokens:int,cost:float}>}
     */
    private function emptyStats(): array
    {
        return [
            'total_requests' => 0,
            'successful' => 0,
            'failed' => 0,
            'input_tokens' => 0,
            'output_tokens' => 0,
            'total_tokens' => 0,
            'estimated_cost_usd' => 0.0,
            'avg_execution_ms' => null,
            'by_provider' => [],
        ];
    }

    /**
     * @return array{requests_today:int,requests_month:int,input_tokens:int,output_tokens:int,total_tokens:int,estimated_cost_usd:float}
     */
    private function emptyProviderUsage(): array
    {
        return [
            'requests_today' => 0,
            'requests_month' => 0,
            'input_tokens' => 0,
            'output_tokens' => 0,
            'total_tokens' => 0,
            'estimated_cost_usd' => 0.0,
        ];
    }

    private function aiLogsTableAvailable(): bool
    {
        try {
            return Schema::hasTable('ai_logs');
        } catch (Throwable) {
            return false;
        }
    }
}
