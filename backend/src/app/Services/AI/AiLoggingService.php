<?php

declare(strict_types=1);

namespace App\Services\AI;

use App\Models\AiLog;
use Illuminate\Support\Carbon;
use Throwable;

class AiLoggingService
{
    /**
     * Start a log entry and return a tracking handle.
     */
    public function begin(
        ?int $companyId,
        ?int $userId,
        ?string $sessionId,
        string $provider,
        string $model,
        string $userPrompt,
        string $sanitizedPrompt,
        ?string $intentType = null,
        ?string $toolName = null,
    ): AiLog {
        return AiLog::create([
            'company_id' => $companyId,
            'user_id' => $userId,
            'session_id' => $sessionId,
            'provider' => $provider,
            'model' => $model,
            'user_prompt' => mb_substr($userPrompt, 0, 10000),
            'sanitized_prompt' => mb_substr($sanitizedPrompt, 0, 10000),
            'prompt_length' => mb_strlen($userPrompt),
            'status' => 'success',
            'intent_type' => $intentType,
            'tool_name' => $toolName,
            'started_at' => Carbon::now(),
        ]);
    }

    /**
     * Mark a log entry as successfully completed with token/cost data.
     */
    public function complete(
        AiLog $log,
        int $inputTokens = 0,
        int $outputTokens = 0,
    ): void {
        $now = Carbon::now();
        $executionMs = $log->started_at
            ? (int) $log->started_at->diffInMilliseconds($now)
            : null;

        $estimatedCost = AiLog::estimateCost(
            provider: (string) $log->provider,
            model: (string) $log->model,
            inputTokens: $inputTokens,
            outputTokens: $outputTokens,
        );

        $log->update([
            'status' => 'success',
            'input_tokens' => $inputTokens,
            'output_tokens' => $outputTokens,
            'total_tokens' => $inputTokens + $outputTokens,
            'estimated_cost_usd' => $estimatedCost,
            'ended_at' => $now,
            'execution_ms' => $executionMs,
        ]);
    }

    /**
     * Mark a log entry as failed.
     */
    public function fail(
        AiLog $log,
        string $errorCode,
        string $errorMessage,
        ?Throwable $exception = null,
    ): void {
        $now = Carbon::now();
        $executionMs = $log->started_at
            ? (int) $log->started_at->diffInMilliseconds($now)
            : null;

        $log->update([
            'status' => 'failed',
            'ended_at' => $now,
            'execution_ms' => $executionMs,
            'error_code' => mb_substr($errorCode, 0, 40),
            'error_message' => mb_substr($errorMessage, 0, 5000),
            'stack_trace' => $exception ? mb_substr($exception->getTraceAsString(), 0, 10000) : null,
        ]);
    }

    /**
     * Mark a log entry as timed out.
     */
    public function timeout(AiLog $log): void
    {
        $log->update([
            'status' => 'timeout',
            'ended_at' => Carbon::now(),
            'error_code' => 'timeout',
            'error_message' => 'Request exceeded configured timeout.',
        ]);
    }

    /**
     * Log a policy-blocked (cancelled) request — no AI call was made.
     */
    public function cancelled(
        ?int $companyId,
        ?int $userId,
        ?string $sessionId,
        string $reason,
    ): void {
        AiLog::create([
            'company_id' => $companyId,
            'user_id' => $userId,
            'session_id' => $sessionId,
            'provider' => 'none',
            'model' => 'none',
            'status' => 'cancelled',
            'error_code' => 'policy_block',
            'error_message' => mb_substr($reason, 0, 5000),
            'started_at' => Carbon::now(),
            'ended_at' => Carbon::now(),
            'execution_ms' => 0,
        ]);
    }

    /**
     * Return aggregated analytics for a company over a date range.
     *
     * @return array{
     *   total_requests: int,
     *   successful: int,
     *   failed: int,
     *   total_tokens: int,
     *   input_tokens: int,
     *   output_tokens: int,
     *   estimated_cost_usd: float,
     *   avg_execution_ms: float|null,
     *   by_provider: array<string, array{requests: int, tokens: int, cost: float}>,
     * }
     */
    public function analytics(?int $companyId, string $from, string $to): array
    {
        $query = AiLog::query()
            ->whereBetween('created_at', [$from, $to]);

        if ($companyId !== null) {
            $query->where('company_id', $companyId);
        }

        $rows = $query->selectRaw(
            'provider,
             COUNT(*) as total_requests,
             SUM(CASE WHEN status = "success" THEN 1 ELSE 0 END) as successful,
             SUM(CASE WHEN status = "failed" THEN 1 ELSE 0 END) as failed,
             SUM(COALESCE(input_tokens, 0)) as input_tokens,
             SUM(COALESCE(output_tokens, 0)) as output_tokens,
             SUM(COALESCE(total_tokens, 0)) as total_tokens,
             SUM(COALESCE(estimated_cost_usd, 0)) as estimated_cost_usd,
             AVG(execution_ms) as avg_execution_ms'
        )->groupBy('provider')->get();

        $byProvider = [];
        $totals = [
            'total_requests' => 0,
            'successful' => 0,
            'failed' => 0,
            'input_tokens' => 0,
            'output_tokens' => 0,
            'total_tokens' => 0,
            'estimated_cost_usd' => 0.0,
            'avg_execution_ms_sum' => 0.0,
        ];

        foreach ($rows as $row) {
            $provider = (string) $row->provider;
            $byProvider[$provider] = [
                'requests' => (int) $row->total_requests,
                'tokens' => (int) $row->total_tokens,
                'cost' => (float) $row->estimated_cost_usd,
            ];

            $totals['total_requests'] += (int) $row->total_requests;
            $totals['successful'] += (int) $row->successful;
            $totals['failed'] += (int) $row->failed;
            $totals['input_tokens'] += (int) $row->input_tokens;
            $totals['output_tokens'] += (int) $row->output_tokens;
            $totals['total_tokens'] += (int) $row->total_tokens;
            $totals['estimated_cost_usd'] += (float) $row->estimated_cost_usd;
        }

        return [
            'total_requests' => $totals['total_requests'],
            'successful' => $totals['successful'],
            'failed' => $totals['failed'],
            'input_tokens' => $totals['input_tokens'],
            'output_tokens' => $totals['output_tokens'],
            'total_tokens' => $totals['total_tokens'],
            'estimated_cost_usd' => round($totals['estimated_cost_usd'], 4),
            'avg_execution_ms' => $totals['total_requests'] > 0
                ? round($rows->avg('avg_execution_ms') ?? 0, 1)
                : null,
            'by_provider' => $byProvider,
        ];
    }
}
