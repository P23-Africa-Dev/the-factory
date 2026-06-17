<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\AI;

use App\Http\Controllers\Controller;
use App\Models\AiLog;
use App\Services\AI\AiLoggingService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;
use Illuminate\View\View;
use Throwable;

class AiManagementController extends Controller
{
    public function __construct(private readonly AiLoggingService $aiLoggingService) {}

    public function index(): View
    {
        $now = Carbon::now();
        $today = $now->toDateString();
        $sevenDaysAgo = $now->copy()->subDays(7)->toDateString();
        $thirtyDaysAgo = $now->copy()->subDays(30)->toDateString();

        $aiLogsReady = $this->aiLogsTableAvailable();
        $statsToday = $this->emptyStats();
        $statsWeek = $this->emptyStats();
        $statsMonth = $this->emptyStats();
        $avgExecutionByProvider = [
            'openai' => null,
            'claude' => null,
        ];

        if ($aiLogsReady) {
            $statsToday = $this->aiLoggingService->analytics(null, $today . ' 00:00:00', $today . ' 23:59:59');
            $statsWeek = $this->aiLoggingService->analytics(null, $sevenDaysAgo . ' 00:00:00', $today . ' 23:59:59');
            $statsMonth = $this->aiLoggingService->analytics(null, $thirtyDaysAgo . ' 00:00:00', $today . ' 23:59:59');

            $avgExecutionByProvider['openai'] = AiLog::query()
                ->where('provider', 'openai')
                ->where('created_at', '>=', $now->copy()->subDays(30))
                ->avg('execution_ms');
            $avgExecutionByProvider['claude'] = AiLog::query()
                ->where('provider', 'claude')
                ->where('created_at', '>=', $now->copy()->subDays(30))
                ->avg('execution_ms');
        }

        // Determine AI status
        $openaiConfigured = trim((string) config('services.ai.openai.api_key')) !== '';
        $claudeConfigured = trim((string) config('services.ai.claude.api_key')) !== '';
        $primaryProvider = (string) config('services.ai.provider', 'openai');
        $fallbackProvider = (string) config('services.ai.fallback_provider', 'claude');

        // Recent failed rate (last 24h)
        $last24hTotal = 0;
        $last24hFailed = 0;

        if ($aiLogsReady) {
            $last24hTotal = AiLog::query()->where('created_at', '>=', $now->copy()->subDay())->count();
            $last24hFailed = AiLog::query()->where('created_at', '>=', $now->copy()->subDay())
                ->where('status', 'failed')
                ->count();
        }

        $errorRate = $last24hTotal > 0 ? round(($last24hFailed / $last24hTotal) * 100, 1) : 0;

        $aiStatus = 'online';
        if (! $openaiConfigured && ! $claudeConfigured) {
            $aiStatus = 'offline';
        } elseif ($errorRate > 20) {
            $aiStatus = 'degraded';
        } elseif ($last24hFailed > 0 && $last24hFailed === $last24hTotal) {
            $aiStatus = 'fallback';
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
        ));
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

        if ($aiLogsReady) {
            $stats = $this->aiLoggingService->analytics(
                companyId: null,
                from: $from->toDateTimeString(),
                to: $now->toDateTimeString(),
            );
        }

        // Daily breakdown for chart
        $dailyData = collect();

        if ($aiLogsReady) {
            $dailyData = AiLog::query()
                ->where('created_at', '>=', $from)
                ->selectRaw("DATE(created_at) as day, COUNT(*) as requests, SUM(COALESCE(total_tokens,0)) as tokens, SUM(COALESCE(estimated_cost_usd,0)) as cost")
                ->groupBy('day')
                ->orderBy('day')
                ->get()
                ->keyBy('day');
        }

        // Build full date range
        $days = [];
        $current = $from->copy();
        while ($current->lte($now)) {
            $key = $current->toDateString();
            $days[$key] = [
                'requests' => (int) ($dailyData[$key]->requests ?? 0),
                'tokens' => (int) ($dailyData[$key]->tokens ?? 0),
                'cost' => (float) ($dailyData[$key]->cost ?? 0),
            ];
            $current->addDay();
        }

        return view('admin.ai.analytics', compact('stats', 'days', 'range', 'aiLogsReady'));
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

    private function aiLogsTableAvailable(): bool
    {
        try {
            return Schema::hasTable('ai_logs');
        } catch (Throwable) {
            return false;
        }
    }
}
