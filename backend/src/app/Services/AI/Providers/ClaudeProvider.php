<?php

declare(strict_types=1);

namespace App\Services\AI\Providers;

use Illuminate\Http\Client\Factory as HttpFactory;
use Illuminate\Http\UploadedFile;

class ClaudeProvider implements AiProviderContract
{
    public function __construct(private readonly HttpFactory $http) {}

    public function isConfigured(): bool
    {
        return trim((string) config('services.ai.claude.api_key')) !== '';
    }

    public function generateText(string $systemPrompt, string $userPrompt, array $options = []): ?string
    {
        if (! $this->isConfigured()) {
            return null;
        }

        $timeoutMs = (int) config('services.ai.request_timeout_ms', 30000);
        $baseUrl = rtrim((string) config('services.ai.claude.base_url', 'https://api.anthropic.com/v1'), '/');

        $response = $this->http
            ->timeout(max(1, (int) ceil($timeoutMs / 1000)))
            ->withHeaders([
                'x-api-key' => (string) config('services.ai.claude.api_key'),
                'anthropic-version' => (string) config('services.ai.claude.version', '2023-06-01'),
            ])
            ->post($baseUrl . '/messages', [
                'model' => (string) ($options['model'] ?? config('services.ai.claude.model', config('services.ai.analyst_model'))),
                'max_tokens' => (int) ($options['max_tokens'] ?? 400),
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

        return is_string($content) && trim($content) !== '' ? trim($content) : null;
    }

    public function transcribeAudio(UploadedFile $audio, string $prompt = '', array $options = []): ?string
    {
        // Claude is currently used for text analytics in this app. Keep voice fallback on OpenAI provider.
        return null;
    }
}
