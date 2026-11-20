<?php

declare(strict_types=1);

namespace App\Services\AI\Providers;

use Illuminate\Http\Client\Factory as HttpFactory;
use Illuminate\Http\UploadedFile;

class GlmProvider implements AiProviderContract
{
    public function __construct(
        private readonly HttpFactory $http,
        private readonly GlmModelResolver $modelResolver,
    ) {}

    public function isConfigured(): bool
    {
        return trim((string) config('services.ai.glm.api_key')) !== '';
    }

    public function generateText(string $systemPrompt, string $userPrompt, array $options = []): ?AiGenerationResult
    {
        if (! $this->isConfigured()) {
            return AiGenerationResult::failure(
                provider: 'glm',
                model: 'unconfigured',
                errorClass: 'not_configured',
                errorMessage: 'No GLM API key configured.',
                purpose: (string) ($options['purpose'] ?? 'default'),
            );
        }

        $purpose = (string) ($options['purpose'] ?? 'default');
        $purposeKey = strtolower(trim($purpose));
        $timeoutMs = $this->resolveTimeoutMs($purposeKey, $options);
        $baseUrl = rtrim((string) config('services.ai.glm.base_url', 'https://api.z.ai/api/paas/v4'), '/');

        $configuredMaxTokens = max(64, (int) config('services.ai.max_tokens', 4000));
        $requestedMaxTokens = (int) ($options['max_tokens'] ?? $configuredMaxTokens);
        $effectiveMaxTokens = max(64, min($configuredMaxTokens, $requestedMaxTokens));

        if (
            in_array($purposeKey, ['operational', 'routing', 'default'], true)
            && empty($options['allow_high_max_tokens'])
        ) {
            $operationalCap = max(64, (int) config('services.ai.glm.operational_max_tokens', 4000));
            $effectiveMaxTokens = min($effectiveMaxTokens, $operationalCap);
        }

        $model = $this->modelResolver->resolve(
            $purpose,
            isset($options['model']) ? (string) $options['model'] : null,
        );

        $reasons = in_array($purposeKey, ['operational', 'analyst', 'report', 'default'], true);
        $payload = [
            'model' => $model,
            'max_tokens' => $effectiveMaxTokens,
            'temperature' => (float) ($options['temperature'] ?? ($reasons ? 0.6 : 0.2)),
            'thinking' => ['type' => $reasons ? 'enabled' : 'disabled'],
            'messages' => [
                ['role' => 'system', 'content' => $systemPrompt],
                ['role' => 'user', 'content' => $userPrompt],
            ],
        ];
        if ($reasons && str_starts_with($model, 'glm-5.2')) {
            $payload['reasoning_effort'] = 'high';
        }

        try {
            $response = $this->http
                ->timeout(max(1, (int) ceil($timeoutMs / 1000)))
                ->connectTimeout(15)
                ->withHeaders(['Accept-Language' => 'en-US,en'])
                ->withToken((string) config('services.ai.glm.api_key'))
                ->post($baseUrl . '/chat/completions', $payload);
        } catch (\Throwable $e) {
            return AiGenerationResult::failure(
                provider: 'glm',
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
                provider: 'glm',
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
                provider: 'glm',
                model: $model,
                errorClass: 'empty_response',
                errorMessage: 'GLM returned an empty completion.',
                httpStatus: $response->status(),
                purpose: $purpose,
            );
        }

        $responseModel = $response->json('model');
        $resolvedModel = is_string($responseModel) && trim($responseModel) !== '' ? trim($responseModel) : $model;

        return new AiGenerationResult(
            text: trim($content),
            provider: 'glm',
            model: $resolvedModel,
            purpose: $purpose,
            inputTokens: $this->intOrNull($response->json('usage.prompt_tokens')),
            outputTokens: $this->intOrNull($response->json('usage.completion_tokens')),
        );
    }

    /**
     * Speech-to-text with GLM-ASR (POST {base}/audio/transcriptions, multipart
     * "model" + "file"). GLM-ASR takes WAV or MP3 and only short clips, so WAV
     * recordings longer than services.ai.glm.asr_max_seconds are split into
     * clips that are transcribed in order and joined.
     */
    public function transcribeAudio(UploadedFile $audio, string $prompt = '', array $options = []): ?AiGenerationResult
    {
        $purpose = (string) ($options['purpose'] ?? 'operational');
        $model = (string) config('services.ai.glm.asr_model', 'glm-asr-2512');
        $fail = static fn (string $class, string $message, ?int $status = null): AiGenerationResult => AiGenerationResult::failure(
            provider: 'glm',
            model: $model,
            errorClass: $class,
            errorMessage: $message,
            httpStatus: $status,
            purpose: $purpose,
        );

        if (! $this->isConfigured()) {
            return $fail('not_configured', 'No GLM API key configured.');
        }

        $path = $audio->getRealPath();
        $bytes = is_string($path) && $path !== '' ? (file_get_contents($path) ?: '') : '';
        if ($bytes === '') {
            return $fail('empty_audio', 'The recording was empty.');
        }

        $isWav = str_starts_with($bytes, 'RIFF') && substr($bytes, 8, 4) === 'WAVE';
        $isMp3 = str_starts_with($bytes, 'ID3') || (strlen($bytes) > 1 && ord($bytes[0]) === 0xFF && (ord($bytes[1]) & 0xE0) === 0xE0);
        if (! $isWav && ! $isMp3) {
            return $fail('unsupported_format', 'GLM-ASR accepts WAV or MP3 audio only.');
        }

        $clips = $isWav
            ? (self::splitWav($bytes, max(5, (int) config('services.ai.glm.asr_max_seconds', 25))) ?? [$bytes])
            : [$bytes];
        $extension = $isWav ? 'wav' : 'mp3';
        $timeoutMs = max(10000, (int) config('services.ai.glm.asr_timeout_ms', 60000));
        $baseUrl = rtrim((string) config('services.ai.glm.base_url', 'https://api.z.ai/api/paas/v4'), '/');

        $parts = [];
        foreach ($clips as $index => $clip) {
            try {
                $response = $this->http
                    ->timeout(max(1, (int) ceil($timeoutMs / 1000)))
                    ->connectTimeout(15)
                    ->withToken((string) config('services.ai.glm.api_key'))
                    ->attach('file', $clip, "voice-{$index}.{$extension}")
                    ->asMultipart()
                    ->post($baseUrl.'/audio/transcriptions', [
                        ['name' => 'model', 'contents' => $model],
                    ]);
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::warning('GLM-ASR transcription error.', ['message' => $e->getMessage()]);

                return $fail(str_contains(strtolower($e->getMessage()), 'timed out') ? 'timeout' : 'unreachable', $e->getMessage());
            }

            if (! $response->successful()) {
                $classified = AiProviderHttpError::classify($response->status(), (string) $response->json('error.message', ''));
                \Illuminate\Support\Facades\Log::warning('GLM-ASR transcription failed.', [
                    'status' => $response->status(),
                    'error_class' => $classified['error_class'],
                    'error' => mb_substr((string) $response->json('error.message', $response->body()), 0, 300),
                    'model' => $model,
                ]);

                return $fail($classified['error_class'], $classified['error_message'], $response->status());
            }

            $text = self::transcriptText($response->json());
            if ($text !== '') {
                $parts[] = $text;
            }
        }

        $transcript = trim(implode(' ', $parts));
        if ($transcript === '') {
            return $fail('empty_transcript', 'No speech was detected in the recording.');
        }

        return new AiGenerationResult(
            text: $transcript,
            provider: 'glm',
            model: $model,
            purpose: $purpose,
        );
    }

    /**
     * Transcript text from a GLM-ASR response ("text", or nested under
     * "data"/"result", or joined "segments").
     */
    private static function transcriptText(mixed $json): string
    {
        if (! is_array($json)) {
            return '';
        }

        foreach (['text', 'data.text', 'result.text'] as $key) {
            $value = data_get($json, $key);
            if (is_string($value) && trim($value) !== '') {
                return trim($value);
            }
        }

        $segments = data_get($json, 'segments');
        if (is_array($segments)) {
            return trim(implode(' ', array_filter(array_map(
                static fn ($segment): string => is_array($segment) ? trim((string) ($segment['text'] ?? '')) : '',
                $segments,
            ))));
        }

        return '';
    }

    /**
     * Split a PCM WAV file into WAV clips of at most $maxSeconds each. Returns
     * null when the file is not a PCM WAV this can parse (it is then sent as is).
     *
     * @return array<int, string>|null
     */
    public static function splitWav(string $bytes, int $maxSeconds): ?array
    {
        if (strlen($bytes) < 44 || ! str_starts_with($bytes, 'RIFF') || substr($bytes, 8, 4) !== 'WAVE') {
            return null;
        }

        $offset = 12;
        $format = null;
        $dataOffset = null;
        $dataSize = null;
        while ($offset + 8 <= strlen($bytes)) {
            $id = substr($bytes, $offset, 4);
            $size = unpack('V', substr($bytes, $offset + 4, 4))[1];
            if ($id === 'fmt ') {
                $format = unpack('vaudioFormat/vchannels/VsampleRate/VbyteRate/vblockAlign/vbitsPerSample', substr($bytes, $offset + 8, 16));
            } elseif ($id === 'data') {
                $dataOffset = $offset + 8;
                $dataSize = min($size, strlen($bytes) - $dataOffset);
                break;
            }
            $offset += 8 + $size + ($size % 2);
        }

        if ($format === null || $dataOffset === null || (int) $format['audioFormat'] !== 1 || (int) $format['blockAlign'] <= 0) {
            return null;
        }

        $blockAlign = (int) $format['blockAlign'];
        $clipBytes = (int) (floor(((int) $format['byteRate'] * $maxSeconds) / $blockAlign) * $blockAlign);
        if ($clipBytes <= 0 || $dataSize <= $clipBytes) {
            return [$bytes];
        }

        $header = static fn (int $size): string => 'RIFF'.pack('V', 36 + $size).'WAVE'
            .'fmt '.pack('VvvVVvv', 16, 1, (int) $format['channels'], (int) $format['sampleRate'], (int) $format['byteRate'], $blockAlign, (int) $format['bitsPerSample'])
            .'data'.pack('V', $size);

        $clips = [];
        for ($start = 0; $start < $dataSize; $start += $clipBytes) {
            $chunk = substr($bytes, $dataOffset + $start, min($clipBytes, $dataSize - $start));
            // Skip a tail shorter than a quarter second; it holds no words.
            if ($clips !== [] && strlen($chunk) < (int) $format['byteRate'] / 4) {
                break;
            }
            $clips[] = $header(strlen($chunk)).$chunk;
        }

        return $clips;
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
            'services.ai.glm.request_timeout_ms',
            (int) config('services.ai.request_timeout_ms', 30000),
        );

        $configured = match ($purposeKey) {
            'routing' => (int) config('services.ai.glm.routing_timeout_ms', 15000),
            'analyst', 'report' => (int) config('services.ai.glm.analyst_timeout_ms', $fallback),
            default => (int) config('services.ai.glm.operational_timeout_ms', min(60000, $fallback)),
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
