<?php

declare(strict_types=1);

namespace App\Services\AI\Providers;

use Illuminate\Http\Client\Factory as HttpFactory;
use Illuminate\Http\UploadedFile;

class OpenAiProvider implements AiProviderContract
{
    public function __construct(private readonly HttpFactory $http) {}

    public function isConfigured(): bool
    {
        return trim((string) config('services.ai.openai.api_key')) !== '';
    }

    public function generateText(string $systemPrompt, string $userPrompt, array $options = []): ?string
    {
        if (! $this->isConfigured()) {
            return null;
        }

        $timeoutMs = (int) config('services.ai.request_timeout_ms', 30000);
        $baseUrl = rtrim((string) config('services.ai.openai.base_url', 'https://api.openai.com/v1'), '/');

        $configuredMaxTokens = max(64, (int) config('services.ai.max_tokens', 4000));
        $requestedMaxTokens = (int) ($options['max_tokens'] ?? $configuredMaxTokens);
        $effectiveMaxTokens = max(64, min($configuredMaxTokens, $requestedMaxTokens));

        $response = $this->http
            ->timeout(max(1, (int) ceil($timeoutMs / 1000)))
            ->withToken((string) config('services.ai.openai.api_key'))
            ->post($baseUrl . '/chat/completions', [
                'model' => (string) ($options['model'] ?? config('services.ai.openai.model', config('services.ai.default_model'))),
                'max_tokens' => $effectiveMaxTokens,
                'temperature' => (float) ($options['temperature'] ?? 0.2),
                'messages' => [
                    ['role' => 'system', 'content' => $systemPrompt],
                    ['role' => 'user', 'content' => $userPrompt],
                ],
            ]);

        if (! $response->successful()) {
            return null;
        }

        $content = $response->json('choices.0.message.content');

        return is_string($content) && trim($content) !== '' ? trim($content) : null;
    }

    public function transcribeAudio(UploadedFile $audio, string $prompt = '', array $options = []): ?string
    {
        if (! $this->isConfigured()) {
            return null;
        }

        try {
            $timeoutMs = (int) config('services.ai.request_timeout_ms', 30000);
            $baseUrl = rtrim((string) config('services.ai.openai.base_url', 'https://api.openai.com/v1'), '/');

            $response = $this->http
                ->timeout(max(1, (int) ceil($timeoutMs / 1000)))
                ->withToken((string) config('services.ai.openai.api_key'))
                ->attach('file', file_get_contents($audio->getRealPath()) ?: '', $audio->getClientOriginalName())
                ->asMultipart()
                ->post($baseUrl . '/audio/transcriptions', [
                    ['name' => 'model', 'contents' => (string) ($options['audio_model'] ?? config('services.ai.openai.audio_model', 'gpt-4o-mini-transcribe'))],
                    ['name' => 'prompt', 'contents' => $prompt],
                ]);

            if (! $response->successful()) {
                return null;
            }

            $text = $response->json('text');

            return is_string($text) && trim($text) !== '' ? trim($text) : null;
        } catch (\Throwable) {
            return null;
        }
    }
}
