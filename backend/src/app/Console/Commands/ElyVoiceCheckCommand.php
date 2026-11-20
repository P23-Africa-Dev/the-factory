<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\AI\Providers\AiProviderContract;
use App\Services\AI\Providers\GlmProvider;
use App\Services\AI\Providers\OpenAiProvider;
use Illuminate\Console\Command;
use Illuminate\Http\UploadedFile;

/**
 * Checks that ELY's speech-to-text works on this server: sends a one-second
 * test tone to each configured provider (GLM-ASR, OpenAI) and prints the result.
 *
 *   php artisan ely:voice-check
 *
 * A tone has no words, so "no speech detected" means the provider is working;
 * any other error (credit, key, model name) is printed as returned.
 */
class ElyVoiceCheckCommand extends Command
{
    protected $signature = 'ely:voice-check';

    protected $description = 'Check that ELY voice transcription (GLM-ASR and OpenAI speech-to-text) is working.';

    public function handle(GlmProvider $glm, OpenAiProvider $openAi): int
    {
        $setting = strtolower((string) config('services.ai.voice_provider', 'auto'));
        $this->line("Voice provider setting (AI_VOICE_PROVIDER): {$setting}");

        $providers = [
            'glm' => ['GLM-ASR', $glm, (string) config('services.ai.glm.asr_model', 'glm-asr-2512')],
            'openai' => ['OpenAI', $openAi, (string) config('services.ai.openai.audio_model', 'gpt-4o-mini-transcribe')],
        ];
        $order = match ($setting) {
            'glm' => ['glm'],
            'openai' => ['openai'],
            default => ['glm', 'openai'],
        };

        $working = [];
        foreach ($order as $key) {
            [$label, $provider, $model] = $providers[$key];
            if (! $provider->isConfigured()) {
                $this->warn("{$label}: not configured (no API key).");

                continue;
            }

            $status = $this->check($provider);
            if ($status === null) {
                $this->info("{$label} ({$model}): working.");
                $working[] = $label;
            } else {
                $this->error("{$label} ({$model}): {$status}");
            }
        }

        if ($working === []) {
            $this->error('No speech-to-text provider is working, so ELY voice input will fail.');

            return self::FAILURE;
        }

        $this->info('ELY voice input will use: '.$working[0].'.');

        return self::SUCCESS;
    }

    /** Null when the provider works, otherwise what went wrong and how to fix it. */
    private function check(AiProviderContract $provider): ?string
    {
        $path = tempnam(sys_get_temp_dir(), 'ely-voice').'.wav';
        file_put_contents($path, $this->testTone());

        try {
            $result = $provider->transcribeAudio(
                new UploadedFile($path, 'voice-check.wav', 'audio/wav', null, true),
                '',
                ['purpose' => 'operational'],
            );
        } finally {
            @unlink($path);
        }

        if ($result === null) {
            return 'no response.';
        }
        if ($result->isSuccessful() || $result->errorClass === 'empty_transcript') {
            return null;
        }

        $message = "failed ({$result->errorClass}".($result->httpStatus !== null ? ", HTTP {$result->httpStatus}" : '').'): '.$result->errorMessage;

        return match ($result->errorClass) {
            'quota_exceeded' => $message.' Fix: add credit to that account.',
            'auth_failed' => $message.' Fix: set a valid API key and restart the PHP container.',
            'model_not_found' => $message.' Fix: set the correct model id (GLM_ASR_MODEL or OPENAI_AUDIO_MODEL).',
            default => $message,
        };
    }

    /** One second of a 440 Hz tone, 16 kHz mono 16-bit WAV. */
    private function testTone(): string
    {
        $rate = 16000;
        $samples = '';
        for ($i = 0; $i < $rate; $i++) {
            $samples .= pack('v', (int) (8000 * sin(2 * M_PI * 440 * $i / $rate)));
        }

        return 'RIFF'.pack('V', 36 + strlen($samples)).'WAVE'
            .'fmt '.pack('VvvVVvv', 16, 1, 1, $rate, $rate * 2, 2, 16)
            .'data'.pack('V', strlen($samples)).$samples;
    }
}
