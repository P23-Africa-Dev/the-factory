<?php

declare(strict_types=1);

namespace App\Services\AI\Admin;

use App\Services\AI\Providers\ClaudeModelResolver;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class AiProviderHealthService
{
    public const CACHE_KEY_OPENAI = 'ai:provider:status:openai';

    public const CACHE_KEY_CLAUDE = 'ai:provider:status:claude';

    private const CACHE_TTL_SECONDS = 600;

    /**
     * @return array<string, mixed>
     */
    public function checkOpenAi(bool $persist = true): array
    {
        return $this->persistIfNeeded($this->probeOpenAi(), 'openai', $persist);
    }

    /**
     * @return array<string, mixed>
     */
    public function checkClaude(bool $persist = true): array
    {
        return $this->persistIfNeeded($this->probeClaude(), 'claude', $persist);
    }

    /**
     * @return array{openai: array<string, mixed>, claude: array<string, mixed>}
     */
    public function checkAll(bool $persist = true): array
    {
        return [
            'openai' => $this->checkOpenAi($persist),
            'claude' => $this->checkClaude($persist),
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    public function cachedStatus(string $provider): ?array
    {
        $key = $provider === 'claude' ? self::CACHE_KEY_CLAUDE : self::CACHE_KEY_OPENAI;

        try {
            $cached = Cache::get($key);
        } catch (\Throwable) {
            return null;
        }

        return is_array($cached) ? $cached : null;
    }

    /**
     * @return array<string, mixed>
     */
    public function displayStatus(string $provider): array
    {
        $cached = $this->cachedStatus($provider);
        if ($cached !== null) {
            return $cached;
        }

        return $provider === 'claude' ? $this->probeClaude() : $this->probeOpenAi();
    }

    /**
     * @return array<string, mixed>
     */
    private function probeOpenAi(): array
    {
        $apiKey = (string) config('services.ai.openai.api_key');
        if (trim($apiKey) === '') {
            return $this->result(
                provider: 'openai',
                ok: false,
                status: 'not_configured',
                label: 'Disconnected',
                message: 'No API key configured.',
                latencyMs: null,
            );
        }

        $start = microtime(true);
        try {
            $baseUrl = rtrim((string) config('services.ai.openai.base_url', 'https://api.openai.com/v1'), '/');
            $response = Http::timeout(12)->withToken($apiKey)->get($baseUrl . '/models');
            $latency = (int) round((microtime(true) - $start) * 1000);

            if ($response->status() === 401) {
                return $this->result('openai', false, 'auth_failed', 'Authentication Failed', 'Invalid API key.', $latency);
            }
            if ($response->status() === 429) {
                return $this->result('openai', false, 'rate_limited', 'Rate Limited', 'Rate limit or quota exceeded.', $latency);
            }
            if ($response->status() === 402) {
                return $this->result('openai', false, 'quota_exceeded', 'Billing Issue', 'Billing limit reached.', $latency);
            }
            if ($response->successful()) {
                $models = collect($response->json('data', []))->pluck('id')->take(5)->values()->all();

                return $this->result('openai', true, 'connected', 'Connected', 'OpenAI API reachable.', $latency, [
                    'sample_models' => $models,
                    'configured_model' => (string) config('services.ai.openai.model'),
                ]);
            }

            return $this->result('openai', false, 'error', 'Error', 'HTTP ' . $response->status(), $latency);
        } catch (\Throwable $e) {
            $latency = (int) round((microtime(true) - $start) * 1000);
            $message = $e->getMessage();
            $status = str_contains(strtolower($message), 'timed out') ? 'timeout' : 'unreachable';

            return $this->result('openai', false, $status, ucfirst(str_replace('_', ' ', $status)), $message, $latency);
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function probeClaude(): array
    {
        $apiKey = (string) config('services.ai.claude.api_key');
        if (trim($apiKey) === '') {
            return $this->result('claude', false, 'not_configured', 'Disconnected', 'No API key configured.', null);
        }

        $resolver = app(ClaudeModelResolver::class);
        $model = $resolver->resolve('default');
        $availableModels = $resolver->availableModelIds();

        $start = microtime(true);
        try {
            $baseUrl = rtrim((string) config('services.ai.claude.base_url', 'https://api.anthropic.com/v1'), '/');
            $response = Http::timeout(12)
                ->withHeaders([
                    'x-api-key' => $apiKey,
                    'anthropic-version' => (string) config('services.ai.claude.version', '2023-06-01'),
                ])
                ->post($baseUrl . '/messages', [
                    'model' => $model,
                    'max_tokens' => 1,
                    'messages' => [['role' => 'user', 'content' => 'ping']],
                ]);

            $latency = (int) round((microtime(true) - $start) * 1000);
            $errorMessage = (string) $response->json('error.message', '');

            if ($response->status() === 401) {
                return $this->result('claude', false, 'auth_failed', 'Authentication Failed', 'Invalid API key.', $latency);
            }
            if ($response->status() === 404) {
                return $this->result('claude', false, 'model_not_found', 'Model Not Found', $errorMessage !== '' ? $errorMessage : "Model {$model} is not available.", $latency, [
                    'resolved_model' => $model,
                    'available_models' => array_slice($availableModels, 0, 5),
                ]);
            }
            if ($response->status() === 429) {
                return $this->result('claude', false, 'rate_limited', 'Rate Limited', 'Rate limit exceeded.', $latency);
            }
            if ($response->status() === 400) {
                if (str_contains(strtolower($errorMessage), 'credit') || str_contains(strtolower($errorMessage), 'billing')) {
                    return $this->result('claude', false, 'quota_exceeded', 'Credits Exhausted', $errorMessage, $latency);
                }
            }
            if (in_array($response->status(), [200, 201], true)) {
                return $this->result('claude', true, 'connected', 'Connected', 'Claude API reachable.', $latency, [
                    'resolved_model' => $model,
                    'configured_model' => (string) config('services.ai.claude.model'),
                    'model_mode' => $this->claudeModelModeLabel(),
                    'available_models' => array_slice($availableModels, 0, 5),
                ]);
            }

            return $this->result('claude', false, 'error', 'Error', $errorMessage !== '' ? $errorMessage : 'HTTP ' . $response->status(), $latency, [
                'resolved_model' => $model,
            ]);
        } catch (\Throwable $e) {
            $latency = (int) round((microtime(true) - $start) * 1000);
            $message = $e->getMessage();
            $status = str_contains(strtolower($message), 'timed out') ? 'timeout' : 'unreachable';

            return $this->result('claude', false, $status, ucfirst(str_replace('_', ' ', $status)), $message, $latency);
        }
    }

    private function claudeModelModeLabel(): string
    {
        $configured = strtolower(trim((string) config('services.ai.claude.model', 'auto')));

        return in_array($configured, ['auto', 'latest', ''], true) ? 'auto' : $configured;
    }

    /**
     * @param  array<string, mixed>  $extra
     * @return array<string, mixed>
     */
    private function result(
        string $provider,
        bool $ok,
        string $status,
        string $label,
        string $message,
        ?int $latencyMs,
        array $extra = [],
    ): array {
        return array_merge([
            'provider' => $provider,
            'ok' => $ok,
            'status' => $status,
            'label' => $label,
            'message' => $message,
            'latency_ms' => $latencyMs,
            'checked_at' => now()->toIso8601String(),
        ], $extra);
    }

    /**
     * @param  array<string, mixed>  $result
     * @return array<string, mixed>
     */
    private function persistIfNeeded(array $result, string $provider, bool $persist): array
    {
        if (! $persist) {
            return $result;
        }

        $key = $provider === 'claude' ? self::CACHE_KEY_CLAUDE : self::CACHE_KEY_OPENAI;

        try {
            $previous = Cache::get($key);
            $previous = is_array($previous) ? $previous : [];

            if (($result['ok'] ?? false) === true) {
                $result['last_success_at'] = now()->toIso8601String();
                $result['last_failed_at'] = $previous['last_failed_at'] ?? null;
            } else {
                $result['last_failed_at'] = now()->toIso8601String();
                $result['last_success_at'] = $previous['last_success_at'] ?? null;
            }

            Cache::put($key, $result, self::CACHE_TTL_SECONDS);
        } catch (\Throwable) {
            // Cache unavailable — return live probe result without persistence.
        }

        app(AiAlertService::class)->syncProviderAlert($result);

        return $result;
    }
}
