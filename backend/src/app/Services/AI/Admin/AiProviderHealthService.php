<?php

declare(strict_types=1);

namespace App\Services\AI\Admin;

use App\Services\AI\Providers\ClaudeModelResolver;
use App\Services\AI\Providers\NvidiaModelResolver;
use App\Services\AI\Providers\OpenAiModelResolver;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class AiProviderHealthService
{
    public const CACHE_KEY_OPENAI = 'ai:provider:status:openai';

    public const CACHE_KEY_CLAUDE = 'ai:provider:status:claude';

    public const CACHE_KEY_NVIDIA = 'ai:provider:status:nvidia';

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
     * @return array<string, mixed>
     */
    public function checkNvidia(bool $persist = true): array
    {
        return $this->persistIfNeeded($this->probeNvidia(), 'nvidia', $persist);
    }

    /**
     * @return array{openai: array<string, mixed>, claude: array<string, mixed>, nvidia: array<string, mixed>}
     */
    public function checkAll(bool $persist = true): array
    {
        return [
            'openai' => $this->checkOpenAi($persist),
            'claude' => $this->checkClaude($persist),
            'nvidia' => $this->checkNvidia($persist),
        ];
    }

    /**
     * @param  array<int, string>  $providers
     */
    public function clearStackHealth(array $providers): void
    {
        foreach ($providers as $provider) {
            $key = $this->cacheKeyFor($provider);
            try {
                Cache::forget($key);
            } catch (\Throwable) {
                // Best-effort clear.
            }
        }
    }

    /**
     * @return array<string, mixed>|null
     */
    public function cachedStatus(string $provider): ?array
    {
        $key = $this->cacheKeyFor($provider);

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

        return match ($provider) {
            'claude' => $this->probeClaude(),
            'nvidia' => $this->probeNvidia(),
            default => $this->probeOpenAi(),
        };
    }

    public function shouldSkipProvider(string $provider): bool
    {
        $cached = $this->cachedStatus($provider);
        if ($cached === null || ($cached['ok'] ?? false) === true) {
            return false;
        }

        $status = (string) ($cached['status'] ?? '');
        $skipStatuses = [
            'quota_exceeded',
            'auth_failed',
            'rate_limited',
            'not_configured',
            'model_not_found',
            'timeout',
            'unreachable',
        ];
        if (! in_array($status, $skipStatuses, true)) {
            return false;
        }

        $lastFailedAt = $cached['last_failed_at'] ?? null;
        if (! is_string($lastFailedAt) || trim($lastFailedAt) === '') {
            return true;
        }

        $ttl = in_array($status, ['timeout', 'unreachable'], true)
            ? max(30, (int) config('services.ai.provider_timeout_skip_ttl_seconds', 90))
            : max(60, (int) config('services.ai.provider_skip_ttl_seconds', 300));

        try {
            $failedAt = \Illuminate\Support\Carbon::parse($lastFailedAt);
        } catch (\Throwable) {
            return true;
        }

        return $failedAt->diffInSeconds(now()) < $ttl;
    }

    public function markUnhealthy(string $provider, string $status, string $message): void
    {
        $label = match ($status) {
            'quota_exceeded' => 'Credits Exhausted',
            'auth_failed' => 'Authentication Failed',
            'rate_limited' => 'Rate Limited',
            'not_configured' => 'Disconnected',
            'model_not_found' => 'Model Not Found',
            'timeout' => 'Timeout',
            'unreachable' => 'Unreachable',
            default => 'Error',
        };

        $this->persistIfNeeded(
            $this->result($provider, false, $status, $label, $message, null),
            $provider,
            true,
        );
    }

    /**
     * @return array{card_class: string, pill_class: string, label: string, message: string}
     */
    public function presentation(array $health): array
    {
        $ok = ($health['ok'] ?? false) === true;
        $status = (string) ($health['status'] ?? '');

        $cardClass = $ok
            ? 'status-connected'
            : (in_array($status, ['rate_limited', 'timeout'], true) ? 'status-warning' : 'status-error');

        $pillClass = $ok
            ? 'connected'
            : (in_array($status, ['rate_limited', 'timeout'], true) ? 'warning' : 'error');

        return [
            'card_class' => $cardClass,
            'pill_class' => $pillClass,
            'label' => (string) ($health['label'] ?? ($ok ? 'Connected' : 'Unavailable')),
            'message' => (string) ($health['message'] ?? ''),
        ];
    }

    /**
     * @param  array<string, mixed>  $openaiHealth
     * @param  array<string, mixed>  $claudeHealth
     * @param  array<string, mixed>|null  $nvidiaHealth
     * @return array{status: string, label: string, icon: string, class: string, active_provider: string}
     */
    public function aggregateStatus(
        array $openaiHealth,
        array $claudeHealth,
        bool $openaiConfigured,
        bool $claudeConfigured,
        string $primaryProvider,
        string $fallbackProvider,
        ?array $lastFailover = null,
        float $errorRate = 0.0,
        string $stack = 'openai_claude',
        ?array $nvidiaHealth = null,
        bool $nvidiaConfigured = false,
    ): array {
        if ($stack === 'nvidia') {
            $nvidiaOk = ($nvidiaHealth['ok'] ?? false) === true;
            $status = (! $nvidiaConfigured || ! $nvidiaOk) ? 'offline' : ($errorRate > 20 ? 'degraded' : 'online');

            return [
                'status' => $status,
                'label' => match ($status) {
                    'online' => 'Online',
                    'offline' => 'Offline',
                    'degraded' => 'Degraded',
                    default => 'Fallback Active',
                },
                'icon' => match ($status) {
                    'online' => 'bi-check-circle-fill',
                    'offline' => 'bi-x-circle-fill',
                    'degraded' => 'bi-exclamation-triangle-fill',
                    default => 'bi-arrow-repeat',
                },
                'class' => match ($status) {
                    'online' => 'ai-status-online',
                    'offline' => 'ai-status-offline',
                    'degraded' => 'ai-status-degraded',
                    default => 'ai-status-fallback',
                },
                'active_provider' => 'NVIDIA',
            ];
        }

        $openaiOk = ($openaiHealth['ok'] ?? false) === true;
        $claudeOk = ($claudeHealth['ok'] ?? false) === true;

        $status = 'online';
        if (! $openaiConfigured && ! $claudeConfigured) {
            $status = 'offline';
        } elseif (! $openaiOk && ! $claudeOk) {
            $status = 'offline';
        } elseif ($errorRate > 20 || ($openaiOk xor $claudeOk)) {
            $status = 'degraded';
        } elseif ($lastFailover !== null) {
            $status = 'fallback';
        }

        $activeProvider = ucfirst($primaryProvider);
        if (! $openaiOk && $claudeOk) {
            $activeProvider = ucfirst($fallbackProvider);
        } elseif (! $claudeOk && $openaiOk) {
            $activeProvider = ucfirst($primaryProvider);
        }

        return [
            'status' => $status,
            'label' => match ($status) {
                'online' => 'Online',
                'offline' => 'Offline',
                'degraded' => 'Degraded',
                default => 'Fallback Active',
            },
            'icon' => match ($status) {
                'online' => 'bi-check-circle-fill',
                'offline' => 'bi-x-circle-fill',
                'degraded' => 'bi-exclamation-triangle-fill',
                default => 'bi-arrow-repeat',
            },
            'class' => match ($status) {
                'online' => 'ai-status-online',
                'offline' => 'ai-status-offline',
                'degraded' => 'ai-status-degraded',
                default => 'ai-status-fallback',
            },
            'active_provider' => $activeProvider,
        ];
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

        $resolver = app(OpenAiModelResolver::class);
        $model = $resolver->resolve('default');
        $availableModels = $resolver->availableModelIds();

        $start = microtime(true);
        try {
            $baseUrl = rtrim((string) config('services.ai.openai.base_url', 'https://api.openai.com/v1'), '/');
            $response = Http::timeout(12)->withToken($apiKey)->post($baseUrl . '/chat/completions', [
                'model' => $model,
                'max_tokens' => 1,
                'messages' => [
                    ['role' => 'user', 'content' => 'ping'],
                ],
            ]);
            $latency = (int) round((microtime(true) - $start) * 1000);
            $errorMessage = (string) $response->json('error.message', '');
            $errorCode = strtolower((string) $response->json('error.code', ''));
            $errorType = strtolower((string) $response->json('error.type', ''));
            $combinedError = strtolower($errorMessage . ' ' . $errorCode . ' ' . $errorType);

            if ($response->status() === 401) {
                return $this->result('openai', false, 'auth_failed', 'Authentication Failed', 'Invalid API key.', $latency);
            }
            if ($response->status() === 404) {
                return $this->result('openai', false, 'model_not_found', 'Model Not Found', $errorMessage !== '' ? $errorMessage : "Model {$model} is not available.", $latency, [
                    'resolved_model' => $model,
                    'available_models' => array_slice($availableModels, 0, 5),
                ]);
            }
            if (in_array($response->status(), [402, 429], true) || $this->openAiErrorIndicatesQuotaIssue($combinedError)) {
                $status = str_contains($combinedError, 'rate') && ! str_contains($combinedError, 'quota') && ! str_contains($combinedError, 'billing')
                    ? 'rate_limited'
                    : 'quota_exceeded';

                $label = $status === 'rate_limited' ? 'Rate Limited' : 'Credits Exhausted';
                $message = $errorMessage !== '' ? $errorMessage : ($status === 'rate_limited' ? 'Rate limit exceeded.' : 'Billing limit reached or API credits exhausted.');

                return $this->result('openai', false, $status, $label, $message, $latency, [
                    'resolved_model' => $model,
                ]);
            }
            if ($response->successful()) {
                return $this->result('openai', true, 'connected', 'Connected', 'OpenAI completions are available.', $latency, [
                    'configured_model' => (string) config('services.ai.openai.model'),
                    'resolved_model' => $model,
                    'model_mode' => $this->openAiModelModeLabel(),
                    'available_models' => array_slice($availableModels, 0, 5),
                ]);
            }

            return $this->result('openai', false, 'error', 'Error', $errorMessage !== '' ? $errorMessage : 'HTTP ' . $response->status(), $latency, [
                'resolved_model' => $model,
            ]);
        } catch (\Throwable $e) {
            $latency = (int) round((microtime(true) - $start) * 1000);
            $message = $e->getMessage();
            $status = str_contains(strtolower($message), 'timed out') ? 'timeout' : 'unreachable';

            return $this->result('openai', false, $status, ucfirst(str_replace('_', ' ', $status)), $message, $latency);
        }
    }

    private function openAiErrorIndicatesQuotaIssue(string $combinedError): bool
    {
        return str_contains($combinedError, 'quota')
            || str_contains($combinedError, 'billing')
            || str_contains($combinedError, 'insufficient_quota')
            || str_contains($combinedError, 'exceeded your current');
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
                return $this->result('claude', true, 'connected', 'Connected', 'Claude completions are available.', $latency, [
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

    /**
     * @return array<string, mixed>
     */
    private function probeNvidia(): array
    {
        $apiKey = (string) config('services.ai.nvidia.api_key');
        if (trim($apiKey) === '') {
            return $this->result(
                provider: 'nvidia',
                ok: false,
                status: 'not_configured',
                label: 'Disconnected',
                message: 'No API key configured.',
                latencyMs: null,
            );
        }

        $resolver = app(NvidiaModelResolver::class);
        $model = $resolver->resolve('operational');

        $start = microtime(true);
        try {
            $baseUrl = rtrim((string) config('services.ai.nvidia.base_url', 'https://integrate.api.nvidia.com/v1'), '/');
            $response = Http::timeout(25)->withToken($apiKey)->post($baseUrl . '/chat/completions', [
                'model' => $model,
                'max_tokens' => 1,
                'messages' => [
                    ['role' => 'user', 'content' => 'ping'],
                ],
            ]);
            $latency = (int) round((microtime(true) - $start) * 1000);
            $errorMessage = (string) $response->json('error.message', '');

            if ($response->status() === 401) {
                return $this->result('nvidia', false, 'auth_failed', 'Authentication Failed', 'Invalid API key.', $latency);
            }
            if ($response->status() === 404) {
                return $this->result('nvidia', false, 'model_not_found', 'Model Not Found', $errorMessage !== '' ? $errorMessage : "Model {$model} is not available.", $latency, [
                    'resolved_model' => $model,
                ]);
            }
            if ($response->status() === 429) {
                return $this->result('nvidia', false, 'rate_limited', 'Rate Limited', 'Rate limit exceeded.', $latency, [
                    'resolved_model' => $model,
                ]);
            }
            if ($response->successful()) {
                return $this->result('nvidia', true, 'connected', 'Connected', 'NVIDIA NIM completions are available.', $latency, [
                    'resolved_model' => $model,
                    'configured_model' => (string) config('services.ai.nvidia.exec_model'),
                    'routing_model' => (string) config('services.ai.nvidia.routing_model'),
                    'analyst_model' => (string) config('services.ai.nvidia.analyst_model'),
                ]);
            }

            return $this->result('nvidia', false, 'error', 'Error', $errorMessage !== '' ? $errorMessage : 'HTTP ' . $response->status(), $latency, [
                'resolved_model' => $model,
            ]);
        } catch (\Throwable $e) {
            $latency = (int) round((microtime(true) - $start) * 1000);
            $message = $e->getMessage();
            $status = str_contains(strtolower($message), 'timed out') ? 'timeout' : 'unreachable';

            return $this->result('nvidia', false, $status, ucfirst(str_replace('_', ' ', $status)), $message, $latency);
        }
    }

    private function claudeModelModeLabel(): string
    {
        $configured = strtolower(trim((string) config('services.ai.claude.model', 'auto')));

        return in_array($configured, ['auto', 'latest', ''], true) ? 'auto' : $configured;
    }

    private function openAiModelModeLabel(): string
    {
        $configured = strtolower(trim((string) config('services.ai.openai.model', 'auto')));

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

        $key = $this->cacheKeyFor($provider);

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

    private function cacheKeyFor(string $provider): string
    {
        return match ($provider) {
            'claude' => self::CACHE_KEY_CLAUDE,
            'nvidia' => self::CACHE_KEY_NVIDIA,
            default => self::CACHE_KEY_OPENAI,
        };
    }
}
