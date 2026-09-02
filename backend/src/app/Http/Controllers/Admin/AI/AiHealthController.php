<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\AI;

use App\Http\Controllers\Controller;
use App\Services\AI\Admin\AiProviderHealthService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\DB;

class AiHealthController extends Controller
{
    public function __construct(private readonly AiProviderHealthService $healthService) {}

    public function check(): JsonResponse
    {
        $providerChecks = $this->healthService->checkAll(persist: false);

        $checks = [
            'openai' => $providerChecks['openai'],
            'claude' => $providerChecks['claude'],
            'nvidia' => $providerChecks['nvidia'],
            'glm' => $providerChecks['glm'],
            'redis' => $this->checkRedis(),
            'queue' => $this->checkQueue(),
        ];

        $providerOk = collect($checks)
            ->only(['openai', 'claude', 'nvidia', 'glm'])
            ->contains(fn ($c) => ($c['ok'] ?? false) === true);
        $infraOk = ($checks['redis']['ok'] ?? false) === true && ($checks['queue']['ok'] ?? false) === true;
        $status = $providerOk && $infraOk ? 'healthy' : ($providerOk || $infraOk ? 'degraded' : 'unhealthy');

        return response()->json([
            'status' => $status,
            'checked_at' => now()->toIso8601String(),
            'checks' => $checks,
        ]);
    }

    public function testProvider(Request $request, string $provider): JsonResponse
    {
        $provider = strtolower($provider);
        if (! in_array($provider, ['openai', 'claude', 'nvidia', 'glm'], true)) {
            return response()->json(['ok' => false, 'message' => 'Unknown provider.'], 422);
        }

        $result = match ($provider) {
            'claude' => $this->healthService->checkClaude(persist: true),
            'nvidia' => $this->healthService->checkNvidia(persist: true),
            'glm' => $this->healthService->checkGlm(persist: true),
            default => $this->healthService->checkOpenAi(persist: true),
        };

        return response()->json($result, ($result['ok'] ?? false) ? 200 : 503);
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
            $failed = DB::table('failed_jobs')->count();

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
