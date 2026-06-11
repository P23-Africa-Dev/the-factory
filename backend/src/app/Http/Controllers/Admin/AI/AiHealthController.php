<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\AI;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Redis;

class AiHealthController extends Controller
{
    public function check(): JsonResponse
    {
        $checks = [
            'openai' => $this->checkOpenAi(),
            'claude' => $this->checkClaude(),
            'redis' => $this->checkRedis(),
            'queue' => $this->checkQueue(),
        ];

        $overallOk = collect($checks)->every(fn($c) => $c['ok'] === true);
        $status = $overallOk ? 'healthy' : 'degraded';

        return response()->json([
            'status' => $status,
            'checked_at' => now()->toIso8601String(),
            'checks' => $checks,
        ]);
    }

    private function checkOpenAi(): array
    {
        $apiKey = (string) config('services.ai.openai.api_key');
        if (trim($apiKey) === '') {
            return ['ok' => false, 'status' => 'not_configured', 'message' => 'No API key configured.', 'latency_ms' => null];
        }

        $start = microtime(true);
        try {
            $response = Http::timeout(10)
                ->withToken($apiKey)
                ->get('https://api.openai.com/v1/models');

            $latency = (int) round((microtime(true) - $start) * 1000);

            if ($response->status() === 401) {
                return ['ok' => false, 'status' => 'auth_failed', 'message' => 'Invalid API key.', 'latency_ms' => $latency];
            }

            if ($response->status() === 429) {
                return ['ok' => false, 'status' => 'quota_exceeded', 'message' => 'Quota exceeded — billing issue.', 'latency_ms' => $latency];
            }

            if ($response->successful()) {
                return ['ok' => true, 'status' => 'reachable', 'message' => 'OpenAI API reachable.', 'latency_ms' => $latency];
            }

            return ['ok' => false, 'status' => 'error', 'message' => 'HTTP ' . $response->status(), 'latency_ms' => $latency];
        } catch (\Throwable $e) {
            $latency = (int) round((microtime(true) - $start) * 1000);
            return ['ok' => false, 'status' => 'unreachable', 'message' => $e->getMessage(), 'latency_ms' => $latency];
        }
    }

    private function checkClaude(): array
    {
        $apiKey = (string) config('services.ai.claude.api_key');
        if (trim($apiKey) === '') {
            return ['ok' => false, 'status' => 'not_configured', 'message' => 'No API key configured.', 'latency_ms' => null];
        }

        $start = microtime(true);
        try {
            $response = Http::timeout(10)
                ->withHeaders([
                    'x-api-key' => $apiKey,
                    'anthropic-version' => (string) config('services.ai.claude.version', '2023-06-01'),
                ])
                ->post('https://api.anthropic.com/v1/messages', [
                    'model' => (string) config('services.ai.claude.model', 'claude-3-5-sonnet-latest'),
                    'max_tokens' => 1,
                    'messages' => [['role' => 'user', 'content' => 'ping']],
                ]);

            $latency = (int) round((microtime(true) - $start) * 1000);

            if ($response->status() === 401) {
                return ['ok' => false, 'status' => 'auth_failed', 'message' => 'Invalid API key.', 'latency_ms' => $latency];
            }

            // 400 with "credit balance too low" = reachable but no funds
            if ($response->status() === 400) {
                $body = $response->json('error.message', '');
                if (str_contains((string) $body, 'credit')) {
                    return ['ok' => false, 'status' => 'quota_exceeded', 'message' => 'Credit balance too low.', 'latency_ms' => $latency];
                }
            }

            if (in_array($response->status(), [200, 201], true)) {
                return ['ok' => true, 'status' => 'reachable', 'message' => 'Claude API reachable.', 'latency_ms' => $latency];
            }

            return ['ok' => false, 'status' => 'error', 'message' => 'HTTP ' . $response->status(), 'latency_ms' => $latency];
        } catch (\Throwable $e) {
            $latency = (int) round((microtime(true) - $start) * 1000);
            return ['ok' => false, 'status' => 'unreachable', 'message' => $e->getMessage(), 'latency_ms' => $latency];
        }
    }

    private function checkRedis(): array
    {
        $start = microtime(true);
        try {
            $key = 'healthcheck:ai:' . now()->timestamp;
            Cache::put($key, 'ok', 5);
            $val = Cache::get($key);
            Cache::forget($key);
            $latency = (int) round((microtime(true) - $start) * 1000);

            if ($val === 'ok') {
                return ['ok' => true, 'status' => 'available', 'message' => 'Redis cache is working.', 'latency_ms' => $latency];
            }

            return ['ok' => false, 'status' => 'read_mismatch', 'message' => 'Redis returned unexpected value.', 'latency_ms' => $latency];
        } catch (\Throwable $e) {
            $latency = (int) round((microtime(true) - $start) * 1000);
            return ['ok' => false, 'status' => 'unreachable', 'message' => $e->getMessage(), 'latency_ms' => $latency];
        }
    }

    private function checkQueue(): array
    {
        try {
            $pending = Queue::size();
            $failed = \Illuminate\Support\Facades\DB::table('failed_jobs')->count();

            return [
                'ok' => true,
                'status' => 'available',
                'message' => "Queue healthy. Pending: {$pending}, Failed: {$failed}",
                'pending_jobs' => $pending,
                'failed_jobs' => $failed,
                'latency_ms' => null,
            ];
        } catch (\Throwable $e) {
            return ['ok' => false, 'status' => 'error', 'message' => $e->getMessage(), 'latency_ms' => null];
        }
    }
}
