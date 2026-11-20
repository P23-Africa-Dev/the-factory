<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\AI\Providers\OpenAiProvider;
use Illuminate\Console\Command;
use Illuminate\Http\UploadedFile;

/**
 * Checks that ELY's speech-to-text works on this server: sends a one-second
 * test tone to the OpenAI transcription API and prints the result.
 *
 *   php artisan ely:voice-check
 *
 * A tone has no words, so "no speech detected" means the service is working;
 * any other error (credit, key, model) is printed as returned.
 */
class ElyVoiceCheckCommand extends Command
{
    protected $signature = 'ely:voice-check';

    protected $description = 'Check that ELY voice transcription (OpenAI speech-to-text) is working.';

    public function handle(OpenAiProvider $openAi): int
    {
        if (! $openAi->isConfigured()) {
            $this->error('OPENAI_API_KEY is not set. Voice transcription needs an OpenAI API key.');

            return self::FAILURE;
        }

        $this->line('Model: '.(string) config('services.ai.openai.audio_model', 'gpt-4o-mini-transcribe'));

        $path = tempnam(sys_get_temp_dir(), 'ely-voice').'.wav';
        file_put_contents($path, $this->testTone());

        try {
            $result = $openAi->transcribeAudio(
                new UploadedFile($path, 'voice-check.wav', 'audio/wav', null, true),
                '',
                ['purpose' => 'operational'],
            );
        } finally {
            @unlink($path);
        }

        if ($result === null) {
            $this->error('No response from the transcription service.');

            return self::FAILURE;
        }

        if ($result->isSuccessful() || $result->errorClass === 'empty_transcript') {
            $this->info('Voice transcription is working.');

            return self::SUCCESS;
        }

        $this->error("Voice transcription failed ({$result->errorClass}"
            .($result->httpStatus !== null ? ", HTTP {$result->httpStatus}" : '').'):');
        $this->line((string) $result->errorMessage);
        if ($result->errorClass === 'quota_exceeded') {
            $this->line('Fix: add credit to the OpenAI account at https://platform.openai.com/settings/organization/billing');
        } elseif ($result->errorClass === 'auth_failed') {
            $this->line('Fix: set a valid OPENAI_API_KEY and restart the PHP container.');
        }

        return self::FAILURE;
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
