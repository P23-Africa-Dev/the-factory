<?php

declare(strict_types=1);

namespace App\Services\AI\Providers;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class OpenAiModelResolver
{
    private const CACHE_KEY_MODELS = 'ai:openai:available_models';

    private const CACHE_KEY_RESOLVED = 'ai:openai:resolved_model:';

    private const CACHE_TTL_SECONDS = 3600;

    /**
     * Resolve the OpenAI model id to use for a given purpose.
     */
    public function resolve(string $purpose = 'default', ?string $requestedModel = null): string
    {
        $requestedModel = trim((string) ($requestedModel ?? ''));
        if ($requestedModel !== '' && ! $this->isAutoMode($requestedModel)) {
            return $requestedModel;
        }

        $configured = trim((string) config('services.ai.openai.model', 'auto'));
        if ($configured !== '' && ! $this->isAutoMode($configured)) {
            return $configured;
        }

        if ($purpose === 'analyst' || $purpose === 'report') {
            $analystModel = trim((string) config('services.ai.analyst_model', 'auto'));
            if ($analystModel !== '' && ! $this->isAutoMode($analystModel)) {
                return $analystModel;
            }
        } else {
            $execModel = trim((string) config('services.ai.exec_model', 'auto'));
            if ($execModel !== '' && ! $this->isAutoMode($execModel)) {
                return $execModel;
            }

            $defaultModel = trim((string) config('services.ai.default_model', 'auto'));
            if ($defaultModel !== '' && ! $this->isAutoMode($defaultModel)) {
                return $defaultModel;
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
        $apiKey = trim((string) config('services.ai.openai.api_key'));
        if ($apiKey === '') {
            return $this->staticFallbackIds();
        }

        try {
            $baseUrl = rtrim((string) config('services.ai.openai.base_url', 'https://api.openai.com/v1'), '/');
            $response = Http::timeout(12)
                ->withToken($apiKey)
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
            'gpt-4.1-mini',
            'gpt-4o-mini',
            'gpt-4.1',
            'gpt-4o',
        ];
    }

    private function pickFromAvailableModels(string $purpose): string
    {
        $available = $this->availableModelIds();
        $usable = array_values(array_filter(
            $available,
            fn (string $id) => $this->isChatModel($id),
        ));

        if ($usable === []) {
            $usable = $this->staticFallbackIds();
        }

        $preferencePatterns = match ($purpose) {
            'analyst', 'report' => ['gpt-4.1', 'gpt-4o', 'o4', 'o3'],
            default => ['gpt-4.1-mini', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4o'],
        };

        foreach ($preferencePatterns as $pattern) {
            $matches = array_values(array_filter(
                $usable,
                fn (string $id) => $this->matchesPattern($id, $pattern),
            ));

            if ($matches !== []) {
                usort($matches, fn (string $a, string $b) => $this->modelRecencyScore($b) <=> $this->modelRecencyScore($a));

                return $matches[0];
            }
        }

        return $usable[0];
    }

    private function isChatModel(string $modelId): bool
    {
        $lower = strtolower($modelId);
        $excluded = ['embedding', 'whisper', 'tts', 'dall-e', 'transcribe', 'realtime', 'moderation', 'davinci', 'babbage'];

        foreach ($excluded as $needle) {
            if (str_contains($lower, $needle)) {
                return false;
            }
        }

        return str_starts_with($lower, 'gpt-') || str_starts_with($lower, 'o1') || str_starts_with($lower, 'o3') || str_starts_with($lower, 'o4');
    }

    private function matchesPattern(string $modelId, string $pattern): bool
    {
        $lower = strtolower($modelId);
        $patternLower = strtolower($pattern);

        if ($patternLower === 'gpt-4.1-mini') {
            return str_contains($lower, 'gpt-4.1-mini') || str_contains($lower, 'gpt-4-1-mini');
        }

        if ($patternLower === 'gpt-4.1') {
            return (str_contains($lower, 'gpt-4.1') || str_contains($lower, 'gpt-4-1'))
                && ! str_contains($lower, 'mini');
        }

        return str_contains($lower, $patternLower);
    }

    private function modelRecencyScore(string $modelId): int
    {
        if (preg_match('/gpt-4\.1(?:-mini)?/', $modelId)) {
            return 500;
        }

        if (preg_match('/gpt-4o(?:-mini)?/', $modelId)) {
            return 400;
        }

        if (preg_match('/(\d{4})/', $modelId, $matches)) {
            return (int) $matches[1];
        }

        return 0;
    }
}
