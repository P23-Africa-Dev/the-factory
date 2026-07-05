<?php

declare(strict_types=1);

namespace App\Services\AI\Providers;

use Illuminate\Http\Client\Factory as HttpFactory;
use Illuminate\Http\UploadedFile;

class ClaudeProvider implements AiProviderContract
{
    public function __construct(
        private readonly HttpFactory $http,
        private readonly ClaudeModelResolver $modelResolver,
    ) {}

    public function isConfigured(): bool
    {
        return trim((string) config('services.ai.claude.api_key')) !== '';
    }

    public function generateText(string $systemPrompt, string $userPrompt, array $options = []): ?AiGenerationResult
    {
        if (! $this->isConfigured()) {
            return null;
        }

        $timeoutMs = (int) config('services.ai.request_timeout_ms', 30000);
        $baseUrl = rtrim((string) config('services.ai.claude.base_url', 'https://api.anthropic.com/v1'), '/');

        $configuredMaxTokens = max(64, (int) config('services.ai.max_tokens', 4000));
        $requestedMaxTokens = (int) ($options['max_tokens'] ?? 400);
        $effectiveMaxTokens = max(64, min($configuredMaxTokens, $requestedMaxTokens));

        $purpose = (string) ($options['purpose'] ?? 'default');
        $model = $this->modelResolver->resolve(
            $purpose,
            isset($options['model']) ? (string) $options['model'] : null,
        );

        $response = $this->http
            ->timeout(max(1, (int) ceil($timeoutMs / 1000)))
            ->withHeaders([
                'x-api-key' => (string) config('services.ai.claude.api_key'),
                'anthropic-version' => (string) config('services.ai.claude.version', '2023-06-01'),
            ])
            ->post($baseUrl . '/messages', [
                'model' => $model,
                'max_tokens' => $effectiveMaxTokens,
                'system' => $systemPrompt,
                'messages' => [
                    [
                        'role' => 'user',
                        'content' => $userPrompt,
                    ],
                ],
            ]);

        if (! $response->successful()) {
            return null;
        }

        $content = $response->json('content.0.text');
        if (! is_string($content) || trim($content) === '') {
            return null;
        }

        $responseModel = $response->json('model');
        $resolvedModel = is_string($responseModel) && trim($responseModel) !== '' ? trim($responseModel) : $model;

        return new AiGenerationResult(
            text: trim($content),
            provider: 'claude',
            model: $resolvedModel,
            purpose: $purpose,
            inputTokens: $this->intOrNull($response->json('usage.input_tokens')),
            outputTokens: $this->intOrNull($response->json('usage.output_tokens')),
        );
    }

    public function transcribeAudio(UploadedFile $audio, string $prompt = '', array $options = []): ?AiGenerationResult
    {
        // Claude is currently used for text analytics in this app. Keep voice fallback on OpenAI provider.
        return null;
    }

    private function intOrNull(mixed $value): ?int
    {
        if (! is_numeric($value)) {
            return null;
        }

        return (int) $value;
    }
}
