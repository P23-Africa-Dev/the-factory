<?php

declare(strict_types=1);

namespace App\Services\AI\Providers;

use Illuminate\Http\Client\Factory as HttpFactory;
use Illuminate\Http\UploadedFile;

class OpenAiProvider implements AiProviderContract
{
    public function __construct(
        private readonly HttpFactory $http,
        private readonly OpenAiModelResolver $modelResolver,
    ) {}

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

        $purpose = (string) ($options['purpose'] ?? 'default');
        $model = $this->modelResolver->resolve(
            $purpose,
            isset($options['model']) ? (string) $options['model'] : null,
        );

        $response = $this->http
            ->timeout(max(1, (int) ceil($timeoutMs / 1000)))
            ->withToken((string) config('services.ai.openai.api_key'))
            ->post($baseUrl . '/chat/completions', [
                'model' => $model,
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

    public function analyzeDocumentFile(
        UploadedFile $file,
        string $systemPrompt,
        string $userPrompt,
        array $options = [],
    ): ?string {
        if (! $this->isConfigured()) {
            return null;
        }

        $path = $file->getRealPath();
        if (! is_string($path) || $path === '') {
            return null;
        }

        $bytes = @file_get_contents($path);
        if (! is_string($bytes) || $bytes === '') {
            return null;
        }

        $extension = strtolower((string) $file->getClientOriginalExtension());
        $mimeType = match ($extension) {
            'pdf' => 'application/pdf',
            default => (string) ($file->getMimeType() ?? 'application/octet-stream'),
        };

        if ($mimeType !== 'application/pdf') {
            return null;
        }

        $timeoutMs = max((int) config('services.ai.request_timeout_ms', 30000), 60000);
        $baseUrl = rtrim((string) config('services.ai.openai.base_url', 'https://api.openai.com/v1'), '/');
        $configuredMaxTokens = max(64, (int) config('services.ai.max_tokens', 4000));
        $requestedMaxTokens = (int) ($options['max_tokens'] ?? 900);
        $effectiveMaxTokens = max(64, min($configuredMaxTokens, $requestedMaxTokens));
        $model = (string) ($options['model'] ?? config('services.ai.openai.vision_model', 'gpt-4o-mini'));

        $response = $this->http
            ->timeout(max(1, (int) ceil($timeoutMs / 1000)))
            ->withToken((string) config('services.ai.openai.api_key'))
            ->post($baseUrl . '/chat/completions', [
                'model' => $model,
                'max_tokens' => $effectiveMaxTokens,
                'temperature' => (float) ($options['temperature'] ?? 0.2),
                'messages' => [
                    ['role' => 'system', 'content' => $systemPrompt],
                    [
                        'role' => 'user',
                        'content' => [
                            [
                                'type' => 'file',
                                'file' => [
                                    'filename' => (string) $file->getClientOriginalName(),
                                    'file_data' => 'data:' . $mimeType . ';base64,' . base64_encode($bytes),
                                ],
                            ],
                            [
                                'type' => 'text',
                                'text' => $userPrompt,
                            ],
                        ],
                    ],
                ],
            ]);

        if (! $response->successful()) {
            logger()->warning('OpenAI document analysis failed.', [
                'status' => $response->status(),
                'body' => $response->json(),
                'file_name' => $file->getClientOriginalName(),
            ]);

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
