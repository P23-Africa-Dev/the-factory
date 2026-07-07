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

    public function generateText(string $systemPrompt, string $userPrompt, array $options = []): ?AiGenerationResult
    {
        if (! $this->isConfigured()) {
            return AiGenerationResult::failure(
                provider: 'openai',
                model: 'unconfigured',
                errorClass: 'not_configured',
                errorMessage: 'No OpenAI API key configured.',
                purpose: (string) ($options['purpose'] ?? 'default'),
            );
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

        try {
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
        } catch (\Throwable $e) {
            return AiGenerationResult::failure(
                provider: 'openai',
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
                provider: 'openai',
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
                provider: 'openai',
                model: $model,
                errorClass: 'empty_response',
                errorMessage: 'OpenAI returned an empty completion.',
                httpStatus: $response->status(),
                purpose: $purpose,
            );
        }

        $responseModel = $response->json('model');
        $resolvedModel = is_string($responseModel) && trim($responseModel) !== '' ? trim($responseModel) : $model;

        return new AiGenerationResult(
            text: trim($content),
            provider: 'openai',
            model: $resolvedModel,
            purpose: $purpose,
            inputTokens: $this->intOrNull($response->json('usage.prompt_tokens')),
            outputTokens: $this->intOrNull($response->json('usage.completion_tokens')),
        );
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

        $timeoutMs = (int) config('services.ai.request_timeout_ms', 30000);
        $baseUrl = rtrim((string) config('services.ai.openai.base_url', 'https://api.openai.com/v1'), '/');
        $purpose = (string) ($options['purpose'] ?? 'operational');
        $visionModel = (string) ($options['vision_model'] ?? config('services.ai.openai.vision_model', 'gpt-4o-mini'));
        $configuredMaxTokens = max(64, (int) config('services.ai.max_tokens', 4000));
        $requestedMaxTokens = (int) ($options['max_tokens'] ?? 900);
        $effectiveMaxTokens = max(64, min($configuredMaxTokens, $requestedMaxTokens));

        $mime = $file->getMimeType() ?? 'application/pdf';
        $encoded = base64_encode((string) file_get_contents($path));
        $dataUri = 'data:' . $mime . ';base64,' . $encoded;

        $response = $this->http
            ->timeout(max(1, (int) ceil($timeoutMs / 1000)))
            ->withToken((string) config('services.ai.openai.api_key'))
            ->post($baseUrl . '/chat/completions', [
                'model' => $visionModel,
                'max_tokens' => $effectiveMaxTokens,
                'temperature' => (float) ($options['temperature'] ?? 0.2),
                'messages' => [
                    ['role' => 'system', 'content' => $systemPrompt],
                    [
                        'role' => 'user',
                        'content' => [
                            ['type' => 'text', 'text' => $userPrompt],
                            ['type' => 'image_url', 'image_url' => ['url' => $dataUri]],
                        ],
                    ],
                ],
            ]);

        if (! $response->successful()) {
            return null;
        }

        $content = $response->json('choices.0.message.content');

        return is_string($content) && trim($content) !== '' ? trim($content) : null;
    }

    public function transcribeAudio(UploadedFile $audio, string $prompt = '', array $options = []): ?AiGenerationResult
    {
        if (! $this->isConfigured()) {
            return null;
        }

        try {
            $timeoutMs = (int) config('services.ai.request_timeout_ms', 30000);
            $baseUrl = rtrim((string) config('services.ai.openai.base_url', 'https://api.openai.com/v1'), '/');
            $audioModel = (string) ($options['audio_model'] ?? config('services.ai.openai.audio_model', 'gpt-4o-mini-transcribe'));

            $response = $this->http
                ->timeout(max(1, (int) ceil($timeoutMs / 1000)))
                ->withToken((string) config('services.ai.openai.api_key'))
                ->attach('file', file_get_contents($audio->getRealPath()) ?: '', $audio->getClientOriginalName())
                ->asMultipart()
                ->post($baseUrl . '/audio/transcriptions', [
                    ['name' => 'model', 'contents' => $audioModel],
                    ['name' => 'prompt', 'contents' => $prompt],
                ]);

            if (! $response->successful()) {
                return null;
            }

            $text = $response->json('text');
            if (! is_string($text) || trim($text) === '') {
                return null;
            }

            return new AiGenerationResult(
                text: trim($text),
                provider: 'openai',
                model: $audioModel,
                purpose: (string) ($options['purpose'] ?? 'operational'),
            );
        } catch (\Throwable) {
            return null;
        }
    }

    private function intOrNull(mixed $value): ?int
    {
        if (! is_numeric($value)) {
            return null;
        }

        return (int) $value;
    }
}
