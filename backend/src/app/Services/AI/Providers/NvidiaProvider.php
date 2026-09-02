<?php

declare(strict_types=1);

namespace App\Services\AI\Providers;

use Illuminate\Http\Client\Factory as HttpFactory;
use Illuminate\Http\UploadedFile;

class NvidiaProvider implements AiProviderContract
{
    public function __construct(
        private readonly HttpFactory $http,
        private readonly NvidiaModelResolver $modelResolver,
    ) {}

    public function isConfigured(): bool
    {
        return trim((string) config('services.ai.nvidia.api_key')) !== '';
    }

    public function generateText(string $systemPrompt, string $userPrompt, array $options = []): ?AiGenerationResult
    {
        if (! $this->isConfigured()) {
            return AiGenerationResult::failure(
                provider: 'nvidia',
                model: 'unconfigured',
                errorClass: 'not_configured',
                errorMessage: 'No NVIDIA API key configured.',
                purpose: (string) ($options['purpose'] ?? 'default'),
            );
        }

        $purpose = (string) ($options['purpose'] ?? 'default');
        $purposeKey = strtolower(trim($purpose));
        $timeoutMs = $this->resolveTimeoutMs($purposeKey, $options);
        $baseUrl = rtrim((string) config('services.ai.nvidia.base_url', 'https://integrate.api.nvidia.com/v1'), '/');

        $configuredMaxTokens = max(64, (int) config('services.ai.max_tokens', 4000));
        $requestedMaxTokens = (int) ($options['max_tokens'] ?? $configuredMaxTokens);
        $effectiveMaxTokens = max(64, min($configuredMaxTokens, $requestedMaxTokens));

        // Day-to-day chat/routing: keep completions short so hosted NIM finishes sooner.
        // Callers can opt out with allow_high_max_tokens for unusual long-form operational jobs.
        if (
            in_array($purposeKey, ['operational', 'routing', 'default'], true)
            && empty($options['allow_high_max_tokens'])
        ) {
            $operationalCap = max(64, (int) config('services.ai.nvidia.operational_max_tokens', 1000));
            $effectiveMaxTokens = min($effectiveMaxTokens, $operationalCap);
        }

        $model = $this->modelResolver->resolve(
            $purpose,
            isset($options['model']) ? (string) $options['model'] : null,
        );

        // Nemotron models default to reasoning ("detailed thinking") mode, which is slow
        // and can spend the entire max_tokens budget on thinking, returning null content.
        // NVIDIA docs: prefixing the system prompt with /no_think disables it.
        $effectiveSystemPrompt = $systemPrompt;
        if ($this->shouldDisableThinking($model, $options)) {
            $effectiveSystemPrompt = "/no_think\n" . $systemPrompt;
        }

        try {
            $response = $this->http
                ->timeout(max(1, (int) ceil($timeoutMs / 1000)))
                ->connectTimeout(15)
                ->withToken((string) config('services.ai.nvidia.api_key'))
                ->post($baseUrl . '/chat/completions', [
                    'model' => $model,
                    'max_tokens' => $effectiveMaxTokens,
                    'temperature' => (float) ($options['temperature'] ?? 0.2),
                    'messages' => [
                        ['role' => 'system', 'content' => $effectiveSystemPrompt],
                        ['role' => 'user', 'content' => $userPrompt],
                    ],
                ]);
        } catch (\Throwable $e) {
            return AiGenerationResult::failure(
                provider: 'nvidia',
                model: $model,
                errorClass: str_contains(strtolower($e->getMessage()), 'timed out') ? 'timeout' : 'unreachable',
                errorMessage: $e->getMessage(),
                purpose: $purpose,
            );
        }

        if (! $response->successful()) {
            $bodyMessage = (string) $response->json('error.message', '');
            $classified = AiProviderHttpError::classify($response->status(), $bodyMessage);

            return AiGenerationResult::failure(
                provider: 'nvidia',
                model: $model,
                errorClass: $classified['error_class'],
                errorMessage: $classified['error_message'],
                httpStatus: $response->status(),
                purpose: $purpose,
            );
        }

        $content = $response->json('choices.0.message.content');
        if (! is_string($content) || trim($content) === '') {
            return AiGenerationResult::failure(
                provider: 'nvidia',
                model: $model,
                errorClass: 'empty_response',
                errorMessage: 'NVIDIA returned an empty completion.',
                httpStatus: $response->status(),
                purpose: $purpose,
            );
        }

        $responseModel = $response->json('model');
        $resolvedModel = is_string($responseModel) && trim($responseModel) !== '' ? trim($responseModel) : $model;

        return new AiGenerationResult(
            text: trim($content),
            provider: 'nvidia',
            model: $resolvedModel,
            purpose: $purpose,
            inputTokens: $this->intOrNull($response->json('usage.prompt_tokens')),
            outputTokens: $this->intOrNull($response->json('usage.completion_tokens')),
        );
    }

    public function transcribeAudio(UploadedFile $audio, string $prompt = '', array $options = []): ?AiGenerationResult
    {
        return AiGenerationResult::failure(
            provider: 'nvidia',
            model: 'unsupported',
            errorClass: 'not_configured',
            errorMessage: 'Audio transcription is not available on the NVIDIA stack.',
            purpose: (string) ($options['purpose'] ?? 'operational'),
        );
    }

    /**
     * @param  array<string, mixed>  $options
     */
    private function shouldDisableThinking(string $model, array $options = []): bool
    {
        if (! str_contains(strtolower($model), 'nemotron')) {
            return false;
        }

        if (array_key_exists('enable_thinking', $options)) {
            return ! (bool) $options['enable_thinking'];
        }

        return ! (bool) config('services.ai.nvidia.enable_thinking', false);
    }

    /**
     * @param  array<string, mixed>  $options
     */
    private function resolveTimeoutMs(string $purposeKey, array $options = []): int
    {
        if (isset($options['timeout_ms']) && is_numeric($options['timeout_ms'])) {
            return max(1000, (int) $options['timeout_ms']);
        }

        $fallback = (int) config(
            'services.ai.nvidia.request_timeout_ms',
            (int) config('services.ai.request_timeout_ms', 30000),
        );

        $configured = match ($purposeKey) {
            'routing' => (int) config('services.ai.nvidia.routing_timeout_ms', 15000),
            'analyst', 'report' => (int) config('services.ai.nvidia.analyst_timeout_ms', $fallback),
            default => (int) config('services.ai.nvidia.operational_timeout_ms', min(60000, $fallback)),
        };

        return max(1000, $configured > 0 ? $configured : $fallback);
    }

    private function intOrNull(mixed $value): ?int
    {
        if (! is_numeric($value)) {
            return null;
        }

        return (int) $value;
    }
}
