<?php

declare(strict_types=1);

namespace App\Services\AI\Providers;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class ClaudeModelResolver
{
    private const CACHE_KEY_MODELS = 'ai:claude:available_models';

    private const CACHE_KEY_RESOLVED = 'ai:claude:resolved_model:';

    private const CACHE_TTL_SECONDS = 3600;

    /**
     * Resolve the Claude model id to use for a given purpose.
     */
    public function resolve(string $purpose = 'default', ?string $requestedModel = null): string
    {
        $requestedModel = trim((string) ($requestedModel ?? ''));
        if ($requestedModel !== '' && ! $this->isAutoMode($requestedModel)) {
            return $requestedModel;
        }

        $configured = trim((string) config('services.ai.claude.model', 'auto'));
        if ($configured !== '' && ! $this->isAutoMode($configured)) {
            return $configured;
        }

        if ($purpose === 'analyst' || $purpose === 'report') {
            $analystModel = trim((string) config('services.ai.analyst_model', 'auto'));
            if ($analystModel !== '' && ! $this->isAutoMode($analystModel)) {
                return $analystModel;
            }
        } elseif ($purpose === 'routing') {
            $routerModel = trim((string) config('services.ai.router_model', 'auto'));
            if ($routerModel !== '' && ! $this->isAutoMode($routerModel)) {
                return $routerModel;
            }
        }

        $cacheKey = self::CACHE_KEY_RESOLVED . $purpose;

        try {
            $cached = Cache::get($cacheKey);
            if (is_string($cached) && $cached !== '') {
                return $cached;
            }
        } catch (\Throwable) {
            // Cache unavailable — resolve live.
        }

        $resolved = $this->pickFromAvailableModels($purpose);

        try {
            Cache::put($cacheKey, $resolved, self::CACHE_TTL_SECONDS);
        } catch (\Throwable) {
            // Best-effort cache.
        }

        return $resolved;
    }

    /**
     * @return array<int, string>
     */
    public function availableModelIds(): array
    {
        try {
            $cached = Cache::get(self::CACHE_KEY_MODELS);
            if (is_array($cached) && $cached !== []) {
                return $cached;
            }
        } catch (\Throwable) {
            // Continue to live fetch.
        }

        $ids = $this->fetchModelIdsFromApi();

        if ($ids !== []) {
            try {
                Cache::put(self::CACHE_KEY_MODELS, $ids, self::CACHE_TTL_SECONDS);
            } catch (\Throwable) {
                // Best-effort cache.
            }
        }

        return $ids;
    }

    public function clearCache(): void
    {
        try {
            Cache::forget(self::CACHE_KEY_MODELS);
            foreach (['default', 'analyst', 'report', 'exec', 'operational'] as $purpose) {
                Cache::forget(self::CACHE_KEY_RESOLVED . $purpose);
            }
        } catch (\Throwable) {
            // No-op when cache is unavailable.
        }
    }

    private function isAutoMode(string $value): bool
    {
        return in_array(strtolower(trim($value)), ['auto', 'latest'], true);
    }

    /**
     * @return array<int, string>
     */
    private function fetchModelIdsFromApi(): array
    {
        $apiKey = trim((string) config('services.ai.claude.api_key'));
        if ($apiKey === '') {
            return $this->staticFallbackIds();
        }

        try {
            $baseUrl = rtrim((string) config('services.ai.claude.base_url', 'https://api.anthropic.com/v1'), '/');
            $response = Http::timeout(12)
                ->withHeaders([
                    'x-api-key' => $apiKey,
                    'anthropic-version' => (string) config('services.ai.claude.version', '2023-06-01'),
                ])
                ->get($baseUrl . '/models');

            if (! $response->successful()) {
                return $this->staticFallbackIds();
            }

            $ids = collect($response->json('data', []))
                ->pluck('id')
                ->filter(fn ($id) => is_string($id) && $id !== '')
                ->values()
                ->all();

            return $ids !== [] ? $ids : $this->staticFallbackIds();
        } catch (\Throwable) {
            return $this->staticFallbackIds();
        }
    }

  /**
     * @return array<int, string>
     */
    private function staticFallbackIds(): array
    {
        return [
            'claude-sonnet-4-6',
            'claude-sonnet-4-5-20250929',
            'claude-haiku-4-5-20251001',
            'claude-opus-4-8',
        ];
    }

    private function pickFromAvailableModels(string $purpose): string
    {
        $available = $this->availableModelIds();
        $usable = array_values(array_filter(
            $available,
            fn (string $id) => ! str_contains(strtolower($id), 'fable'),
        ));

        if ($usable === []) {
            $usable = $this->staticFallbackIds();
        }

        $preferencePatterns = match ($purpose) {
            'analyst', 'report' => ['sonnet', 'opus', 'haiku'],
            'routing' => ['haiku', 'sonnet'],
            default => ['sonnet', 'haiku', 'opus'],
        };

        foreach ($preferencePatterns as $pattern) {
            $matches = array_values(array_filter(
                $usable,
                fn (string $id) => str_contains(strtolower($id), $pattern),
            ));

            if ($matches !== []) {
                usort($matches, fn (string $a, string $b) => $this->modelRecencyScore($b) <=> $this->modelRecencyScore($a));

                return $matches[0];
            }
        }

        return $usable[0];
    }

    private function modelRecencyScore(string $modelId): int
    {
        if (preg_match('/(\d+)-(\d+)/', $modelId, $matches)) {
            return ((int) $matches[1] * 100) + (int) $matches[2];
        }

        if (preg_match('/(\d{8})/', $modelId, $matches)) {
            return (int) $matches[1];
        }

        return 0;
    }
}
