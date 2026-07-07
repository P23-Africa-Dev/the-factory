<?php

declare(strict_types=1);

namespace App\Services\AI\Admin;

use App\Models\AiLog;
use Illuminate\Support\Carbon;

class AiOperationsAnalyticsService
{
    /**
     * @return array<string, array{
     *   requests_today: int,
     *   requests_month: int,
     *   input_tokens: int,
     *   output_tokens: int,
     *   total_tokens: int,
     *   estimated_cost_usd: float,
     * }>
     */
    public function providerUsage(string $today, string $monthStart): array
    {
        $providers = ['openai', 'claude', 'demo'];
        $result = [];

        foreach ($providers as $provider) {
            $todayRow = AiLog::query()
                ->llmInvocations()
                ->where('provider', $provider)
                ->whereDate('created_at', $today)
                ->selectRaw('COUNT(*) as requests, SUM(COALESCE(input_tokens,0)) as input_tokens, SUM(COALESCE(output_tokens,0)) as output_tokens, SUM(COALESCE(total_tokens,0)) as total_tokens, SUM(COALESCE(estimated_cost_usd,0)) as cost')
                ->first();

            $monthRow = AiLog::query()
                ->llmInvocations()
                ->where('provider', $provider)
                ->where('created_at', '>=', $monthStart)
                ->selectRaw('COUNT(*) as requests, SUM(COALESCE(input_tokens,0)) as input_tokens, SUM(COALESCE(output_tokens,0)) as output_tokens, SUM(COALESCE(total_tokens,0)) as total_tokens, SUM(COALESCE(estimated_cost_usd,0)) as cost')
                ->first();

            $result[$provider] = [
                'requests_today' => (int) ($todayRow->requests ?? 0),
                'requests_month' => (int) ($monthRow->requests ?? 0),
                'input_tokens' => (int) ($monthRow->input_tokens ?? 0),
                'output_tokens' => (int) ($monthRow->output_tokens ?? 0),
                'total_tokens' => (int) ($monthRow->total_tokens ?? 0),
                'estimated_cost_usd' => round((float) ($monthRow->cost ?? 0), 4),
            ];
        }

        return $result;
    }

    /**
     * @return array<int, array{user_id: int, name: string, email: string, requests: int}>
     */
    public function topUsers(Carbon $from, int $limit = 5): array
    {
        return AiLog::query()
            ->llmInvocations()
            ->where('ai_logs.created_at', '>=', $from)
            ->whereNotNull('ai_logs.user_id')
            ->join('users', 'users.id', '=', 'ai_logs.user_id')
            ->selectRaw('ai_logs.user_id, users.name, users.email, COUNT(*) as requests')
            ->groupBy('ai_logs.user_id', 'users.name', 'users.email')
            ->orderByDesc('requests')
            ->limit($limit)
            ->get()
            ->map(fn ($row) => [
                'user_id' => (int) $row->user_id,
                'name' => (string) $row->name,
                'email' => (string) $row->email,
                'requests' => (int) $row->requests,
            ])
            ->all();
    }

    /**
     * @return array<int, array{company_id: int, name: string, requests: int}>
     */
    public function topOrganizations(Carbon $from, int $limit = 5): array
    {
        return AiLog::query()
            ->llmInvocations()
            ->where('ai_logs.created_at', '>=', $from)
            ->whereNotNull('ai_logs.company_id')
            ->join('companies', 'companies.id', '=', 'ai_logs.company_id')
            ->selectRaw('ai_logs.company_id, companies.name, COUNT(*) as requests')
            ->groupBy('ai_logs.company_id', 'companies.name')
            ->orderByDesc('requests')
            ->limit($limit)
            ->get()
            ->map(fn ($row) => [
                'company_id' => (int) $row->company_id,
                'name' => (string) $row->name,
                'requests' => (int) $row->requests,
            ])
            ->all();
    }

    /**
     * @return array<int, array{model: string, requests: int, percentage: float}>
     */
    public function modelUsage(Carbon $from, int $limit = 8): array
    {
        return array_map(
            static fn (array $row): array => [
                'model' => $row['label'],
                'requests' => $row['requests'],
                'percentage' => $row['percentage'],
            ],
            $this->modelUsageDetailed($from, $limit),
        );
    }

    /**
     * @return array<int, array{
     *   provider: string,
     *   model: string,
     *   label: string,
     *   requests: int,
     *   tokens: int,
     *   cost: float,
     *   percentage: float,
     * }>
     */
    public function modelUsageDetailed(Carbon $from, int $limit = 8): array
    {
        $rows = AiLog::query()
            ->llmInvocations()
            ->where('created_at', '>=', $from)
            ->whereNotIn('model', ['none', 'auto'])
            ->whereNotNull('model')
            ->selectRaw('provider, model, COUNT(*) as requests, SUM(COALESCE(total_tokens,0)) as tokens, SUM(COALESCE(estimated_cost_usd,0)) as cost')
            ->groupBy('provider', 'model')
            ->orderByDesc('requests')
            ->limit($limit)
            ->get();

        $total = (int) $rows->sum('requests');

        return $rows->map(function ($row) use ($total): array {
            $provider = (string) $row->provider;
            $model = (string) $row->model;

            return [
                'provider' => $provider,
                'model' => $model,
                'label' => ucfirst($provider) . ' → ' . $model,
                'requests' => (int) $row->requests,
                'tokens' => (int) $row->tokens,
                'cost' => round((float) $row->cost, 4),
                'percentage' => $total > 0 ? round(((int) $row->requests / $total) * 100, 1) : 0.0,
            ];
        })->all();
    }

    /**
     * @return array<string, array<int, array{model: string, requests: int, tokens: int, cost: float}>>
     */
    public function providerModelMatrix(Carbon $from): array
    {
        $rows = AiLog::query()
            ->llmInvocations()
            ->where('created_at', '>=', $from)
            ->whereNotIn('model', ['none', 'auto'])
            ->whereIn('provider', ['openai', 'claude', 'demo'])
            ->selectRaw('provider, model, COUNT(*) as requests, SUM(COALESCE(total_tokens,0)) as tokens, SUM(COALESCE(estimated_cost_usd,0)) as cost')
            ->groupBy('provider', 'model')
            ->orderBy('provider')
            ->orderByDesc('requests')
            ->get();

        $matrix = [];
        foreach ($rows as $row) {
            $provider = (string) $row->provider;
            $matrix[$provider][] = [
                'model' => (string) $row->model,
                'requests' => (int) $row->requests,
                'tokens' => (int) $row->tokens,
                'cost' => round((float) $row->cost, 4),
            ];
        }

        return $matrix;
    }

    /**
     * @return array<string, array{requests: int, tokens: int, successful: int, failed: int}>
     */
    public function dailyTrends(Carbon $from, Carbon $to): array
    {
        $rows = AiLog::query()
            ->llmInvocations()
            ->whereBetween('created_at', [$from, $to])
            ->selectRaw("DATE(created_at) as day, COUNT(*) as requests, SUM(COALESCE(total_tokens,0)) as tokens, SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful, SUM(CASE WHEN status IN ('failed','timeout') THEN 1 ELSE 0 END) as failed")
            ->groupBy('day')
            ->orderBy('day')
            ->get()
            ->keyBy('day');

        $days = [];
        $current = $from->copy()->startOfDay();
        while ($current->lte($to)) {
            $key = $current->toDateString();
            $row = $rows[$key] ?? null;
            $days[$key] = [
                'requests' => (int) ($row->requests ?? 0),
                'tokens' => (int) ($row->tokens ?? 0),
                'successful' => (int) ($row->successful ?? 0),
                'failed' => (int) ($row->failed ?? 0),
            ];
            $current->addDay();
        }

        return $days;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function recentErrors(int $limit = 15): array
    {
        return AiLog::query()
            ->llmInvocations()
            ->with(['user:id,name,email', 'company:id,name'])
            ->whereIn('status', ['failed', 'timeout'])
            ->latest()
            ->limit($limit)
            ->get()
            ->map(fn (AiLog $log) => [
                'id' => $log->id,
                'message' => $log->error_message ?? 'Unknown error',
                'error_code' => $log->error_code,
                'provider' => $log->provider,
                'model' => $log->model,
                'user' => $log->user?->name,
                'user_email' => $log->user?->email,
                'company' => $log->company?->name,
                'status' => $log->status,
                'resolution' => 'open',
                'occurred_at' => $log->created_at?->toIso8601String(),
                'log_url' => route('admin.ai.logs.show', $log),
            ])
            ->all();
    }

    /**
     * @return array<int, array<string, string>>
     */
    public function warningBanners(array $openaiHealth, array $claudeHealth): array
    {
        $banners = [];

        foreach ([$openaiHealth, $claudeHealth] as $health) {
            if (($health['ok'] ?? false) === true) {
                continue;
            }

            $status = (string) ($health['status'] ?? '');
            $provider = ucfirst((string) ($health['provider'] ?? 'Provider'));

            $message = match ($status) {
                'auth_failed' => "{$provider} API key invalid or revoked.",
                'quota_exceeded' => "{$provider} billing limit reached or API credits exhausted.",
                'rate_limited' => "{$provider} rate limit exceeded.",
                'not_configured' => "{$provider} is not configured.",
                'timeout' => "{$provider} connection timed out.",
                default => (string) ($health['message'] ?? "{$provider} is unavailable."),
            };

            $severity = in_array($status, ['auth_failed', 'quota_exceeded', 'not_configured'], true) ? 'danger' : 'warning';
            $banners[] = [
                'provider' => (string) ($health['provider'] ?? ''),
                'severity' => $severity,
                'message' => $message,
            ];
        }

        return $banners;
    }

    public function checkSpendingAlert(float $monthlyCostUsd): void
    {
        $threshold = (float) config('services.ai.admin.spending_alert_usd', 500);
        if ($threshold <= 0 || $monthlyCostUsd < $threshold) {
            return;
        }

        app(AiAlertService::class)->syncSpendingAlert($monthlyCostUsd, $threshold);
    }
}
