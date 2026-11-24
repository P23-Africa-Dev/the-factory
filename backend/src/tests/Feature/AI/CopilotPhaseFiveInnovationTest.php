<?php

declare(strict_types=1);

namespace Tests\Feature\AI;

use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;
use Tests\TestCase;

final class CopilotPhaseFiveInnovationTest extends TestCase
{
    use RefreshDatabase;

    public function test_voice_transcription_uses_openai_whisper_regardless_of_chat_stack(): void
    {
        // Chat stack is GLM (no speech-to-text), but OpenAI is configured.
        config([
            'services.ai.stack' => 'glm',
            'services.ai.glm.api_key' => '',
            'services.ai.openai.api_key' => 'test-key',
            'services.ai.openai.base_url' => 'https://api.openai.test/v1',
        ]);
        \Illuminate\Support\Facades\Http::fake([
            'api.openai.test/*' => \Illuminate\Support\Facades\Http::response(['text' => 'Create a task for Ada tomorrow at 9am'], 200),
        ]);

        $path = tempnam(sys_get_temp_dir(), 'ely').'.mp3';
        file_put_contents($path, 'fake-audio-bytes');
        $audio = new UploadedFile($path, 'note.mp3', 'audio/mpeg', null, true);

        $result = app(\App\Services\AI\Providers\AiProviderRouter::class)
            ->transcribeAudio($audio, 'transcribe', ['purpose' => 'operational']);

        @unlink($path);

        $this->assertNotNull($result);
        $this->assertSame('openai', $result->provider);
        $this->assertSame('Create a task for Ada tomorrow at 9am', $result->text);

        \Illuminate\Support\Facades\Http::assertSent(
            static fn ($request): bool => str_contains($request->url(), '/audio/transcriptions'),
        );
    }

    public function test_voice_transcription_explains_an_empty_openai_account(): void
    {
        [$company, $admin] = $this->seedCompanyUser('admin');

        config(['services.ai.openai.api_key' => 'test-key', 'services.ai.openai.base_url' => 'https://api.openai.test/v1', 'services.ai.glm.api_key' => '']);
        \Illuminate\Support\Facades\Http::fake([
            'api.openai.test/*' => \Illuminate\Support\Facades\Http::response([
                'error' => [
                    'message' => 'You have no credits remaining.',
                    'type' => 'insufficient_quota',
                    'code' => 'credit_balance_exhausted',
                ],
            ], 429),
        ]);

        $path = tempnam(sys_get_temp_dir(), 'ely').'.mp3';
        file_put_contents($path, 'fake-audio-bytes');
        $result = app(\App\Services\AI\Innovation\PhaseFiveCopilotService::class)->transcribeVoice(
            $admin,
            new UploadedFile($path, 'note.mp3', 'audio/mpeg', null, true),
            (int) $company->id,
        );
        @unlink($path);

        $this->assertFalse($result['transcribed']);
        $this->assertSame('', $result['transcript']);
        $this->assertSame('quota_exceeded', $result['error_code']);
        $this->assertStringContainsString('run out of credit', (string) $result['error']);

        // The raw reason is kept for platform admins in the AI logs.
        $this->assertDatabaseHas('ai_logs', ['provider' => 'openai']);
    }

    public function test_voice_transcription_returns_a_clear_error_when_not_configured(): void
    {
        [$company, $admin] = $this->seedCompanyUser('admin');

        config(['services.ai.openai.api_key' => '', 'services.ai.glm.api_key' => '']);

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/voice/transcriptions', [
                'company_id' => $company->id,
                'audio' => UploadedFile::fake()->create('note.mp3', 120, 'audio/mpeg'),
            ]);

        // No fake placeholder transcript; a real reason is surfaced instead.
        $response
            ->assertOk()
            ->assertJsonPath('data.transcribed', false)
            ->assertJsonPath('data.transcript', '');
        $response->assertJsonPath('data.error_code', 'not_configured');
        $this->assertStringContainsString('not set up', (string) $response->json('data.error'));
    }

    public function test_file_analysis_endpoint_accepts_supported_file_types(): void
    {
        [$company, $admin] = $this->seedCompanyUser('admin');

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/files/analyze', [
                'company_id' => $company->id,
                'file' => UploadedFile::fake()->create('kpi-report.pdf', 300, 'application/pdf'),
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.pipeline', 'file.analysis.v1')
            ->assertJsonPath('data.analysis.kind', 'document');
    }

    public function test_file_analysis_endpoint_summarizes_text_files_with_ai(): void
    {
        [$company, $admin] = $this->seedCompanyUser('admin');

        $mockRouter = \Mockery::mock(\App\Services\AI\Providers\AiProviderRouter::class);
        $mockRouter->shouldIgnoreMissing();
        $mockRouter
            ->shouldReceive('generateForPurpose')
            ->once()
            ->withArgs(function (string $purpose): bool {
                return $purpose === 'operational';
            })
            ->andReturn(\Tests\Support\AiGenerationTestFactory::result('Summary: revenue up 12%. Next action: review payroll approvals.'));
        $this->app->instance(\App\Services\AI\Providers\AiProviderRouter::class, $mockRouter);

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/files/analyze', [
                'company_id' => $company->id,
                'file' => UploadedFile::fake()->createWithContent('kpi.txt', 'Revenue increased 12 percent in Q2.'),
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.analysis.ai_generated', true)
            ->assertJsonPath('data.analysis.summary', 'Summary: revenue up 12%. Next action: review payroll approvals.');
    }

    public function test_transcript_summary_endpoint_returns_key_points_and_actions(): void
    {
        [$company, $admin] = $this->seedCompanyUser('admin');

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/meetings/transcripts/summarize', [
                'company_id' => $company->id,
                'transcript' => "Action: Follow up with payroll approvals\nWe should reassign two field technicians to project delta\nNext step: send draft plan by Friday",
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.pipeline', 'meeting.transcript.summary.v1')
            ->assertJsonCount(3, 'data.summary.key_points');
    }

    public function test_forecast_overview_returns_snapshot_and_recommendations(): void
    {
        [$company, $admin] = $this->seedCompanyUser('admin');

        $mockRouter = \Mockery::mock(\App\Services\AI\Providers\AiProviderRouter::class);
        $mockRouter->shouldIgnoreMissing();
        $mockRouter
            ->shouldReceive('routingMetadata')
            ->andReturn(['provider' => 'openai', 'model' => 'gpt-test', 'purpose' => 'report']);
        $mockRouter
            ->shouldReceive('generateForPurpose')
            ->once()
            ->withArgs(function (string $purpose): bool {
                return $purpose === 'report';
            })
            ->andReturn(\Tests\Support\AiGenerationTestFactory::result('Operations remain stable with focused attention needed on overdue tasks and payroll approvals.'));
        $this->app->instance(\App\Services\AI\Providers\AiProviderRouter::class, $mockRouter);

        $response = $this
            ->actingAs($admin)
            ->getJson('/api/v1/copilot/forecast/overview?company_id=' . $company->id . '&horizon=14');

        $response
            ->assertOk()
            ->assertJsonPath('data.pipeline', 'forecast.recommendations.v2')
            ->assertJsonPath('data.forecast.horizon_days', 14)
            ->assertJsonPath('data.forecast.outlook', 'next_14_days')
            ->assertJsonStructure([
                'data' => [
                    'snapshot' => [
                        'kpis',
                        'activity_summary',
                        'project_kpis',
                        'payroll_overview',
                        'signals',
                        'trends',
                    ],
                    'forecast' => [
                        'recommendations',
                        'structured_recommendations',
                        'narrative',
                        'confidence',
                        'risk_level',
                    ],
                ],
            ]);
    }

    /**
     * @return array{0: Company, 1: User}
     */
    private function seedCompanyUser(string $role): array
    {
        $company = Company::query()->create([
            'company_id' => strtoupper(Str::random(10)),
            'name' => 'Factory ' . Str::upper(Str::random(4)),
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Operations management',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        /** @var User $user */
        $user = User::factory()->createOne([
            'is_active' => true,
        ]);

        $company->users()->attach($user->id, [
            'role' => $role,
            'joined_at' => now(),
        ]);

        return [$company, $user];
    }
}
