<?php

declare(strict_types=1);

namespace Tests\Feature\AI;

use App\Services\AI\Providers\AiProviderRouter;
use App\Services\AI\Providers\GlmProvider;
use Illuminate\Http\Client\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Speech-to-text for ELY voice input: GLM-ASR first, OpenAI as fallback.
 */
final class ElyVoiceProvidersTest extends TestCase
{
    /** @var array<int, string> */
    private array $tempFiles = [];

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'services.ai.voice_provider' => 'auto',
            'services.ai.glm.api_key' => 'glm-key',
            'services.ai.glm.base_url' => 'https://glm.test/api/paas/v4',
            'services.ai.glm.asr_model' => 'glm-asr-2512',
            'services.ai.glm.asr_max_seconds' => 25,
            'services.ai.openai.api_key' => 'openai-key',
            'services.ai.openai.base_url' => 'https://openai.test/v1',
        ]);
    }

    protected function tearDown(): void
    {
        foreach ($this->tempFiles as $path) {
            @unlink($path);
        }
        parent::tearDown();
    }

    public function test_glm_asr_transcribes_a_wav_recording(): void
    {
        Http::fake([
            'glm.test/*' => Http::response(['text' => 'Create a task for Ada tomorrow'], 200),
            'openai.test/*' => Http::response(['text' => 'should not be used'], 200),
        ]);

        $result = $this->transcribe($this->wav(3));

        $this->assertTrue($result->isSuccessful());
        $this->assertSame('glm', $result->provider);
        $this->assertSame('Create a task for Ada tomorrow', $result->text);

        Http::assertSent(static fn (Request $request): bool => $request->url() === 'https://glm.test/api/paas/v4/audio/transcriptions'
            && $request->isMultipart()
            && collect($request->data())->contains(static fn ($part): bool => ($part['name'] ?? null) === 'model' && ($part['contents'] ?? null) === 'glm-asr-2512'));
        Http::assertNotSent(static fn (Request $request): bool => str_contains($request->url(), 'openai.test'));
    }

    public function test_long_recordings_are_split_into_clips_and_joined(): void
    {
        $call = 0;
        Http::fake([
            'glm.test/*' => function () use (&$call) {
                $call++;

                return Http::response(['text' => "part {$call}"], 200);
            },
        ]);

        // 60 seconds at a 25 second clip limit: 25 + 25 + 10.
        $result = $this->transcribe($this->wav(60));

        $this->assertSame('part 1 part 2 part 3', $result->text);
        Http::assertSentCount(3);
    }

    public function test_split_wav_keeps_valid_headers(): void
    {
        $clips = GlmProvider::splitWav($this->wav(60), 25);

        $this->assertCount(3, $clips);
        foreach ($clips as $clip) {
            $this->assertStringStartsWith('RIFF', $clip);
            $this->assertSame('WAVE', substr($clip, 8, 4));
            $dataSize = unpack('V', substr($clip, 40, 4))[1];
            $this->assertSame(strlen($clip) - 44, $dataSize);
        }
        $this->assertSame(25 * 32000, strlen($clips[0]) - 44);
        $this->assertSame(10 * 32000, strlen($clips[2]) - 44);
        $this->assertNull(GlmProvider::splitWav('not audio', 25));
    }

    public function test_falls_back_to_openai_when_glm_fails(): void
    {
        Http::fake([
            'glm.test/*' => Http::response(['error' => ['message' => 'Unknown model']], 404),
            'openai.test/*' => Http::response(['text' => 'From OpenAI'], 200),
        ]);

        $result = $this->transcribe($this->wav(2));

        $this->assertSame('openai', $result->provider);
        $this->assertSame('From OpenAI', $result->text);
        $this->assertSame('glm', $result->failoverFrom);
    }

    public function test_silence_does_not_fall_back(): void
    {
        Http::fake([
            'glm.test/*' => Http::response(['text' => ''], 200),
            'openai.test/*' => Http::response(['text' => 'should not be used'], 200),
        ]);

        $result = $this->transcribe($this->wav(2));

        $this->assertSame('empty_transcript', $result->errorClass);
        Http::assertNotSent(static fn (Request $request): bool => str_contains($request->url(), 'openai.test'));
    }

    public function test_browser_webm_goes_to_openai_because_glm_needs_wav_or_mp3(): void
    {
        Http::fake([
            'glm.test/*' => Http::response(['text' => 'should not be used'], 200),
            'openai.test/*' => Http::response(['text' => 'From OpenAI'], 200),
        ]);

        $result = $this->transcribe("\x1A\x45\xDF\xA3".str_repeat("\0", 200), 'note.webm', 'audio/webm');

        $this->assertSame('openai', $result->provider);
        Http::assertNotSent(static fn (Request $request): bool => str_contains($request->url(), 'glm.test'));
    }

    public function test_provider_setting_can_force_openai(): void
    {
        config(['services.ai.voice_provider' => 'openai']);
        Http::fake([
            'glm.test/*' => Http::response(['text' => 'should not be used'], 200),
            'openai.test/*' => Http::response(['text' => 'From OpenAI'], 200),
        ]);

        $this->assertSame('openai', $this->transcribe($this->wav(2))->provider);
    }

    private function transcribe(string $bytes, string $name = 'note.wav', string $mime = 'audio/wav'): \App\Services\AI\Providers\AiGenerationResult
    {
        $path = tempnam(sys_get_temp_dir(), 'ely-test');
        file_put_contents($path, $bytes);
        $this->tempFiles[] = $path;

        $result = app(AiProviderRouter::class)->transcribeAudio(new UploadedFile($path, $name, $mime, null, true), '', ['purpose' => 'operational']);
        $this->assertNotNull($result);

        return $result;
    }

    /** A 16 kHz mono 16-bit WAV of the given length. */
    private function wav(int $seconds): string
    {
        $data = str_repeat(pack('v', 1000), 16000 * $seconds);

        return 'RIFF'.pack('V', 36 + strlen($data)).'WAVE'
            .'fmt '.pack('VvvVVvv', 16, 1, 1, 16000, 32000, 2, 16)
            .'data'.pack('V', strlen($data)).$data;
    }
}
