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

    public function test_voice_transcription_endpoint_accepts_audio_upload(): void
    {
        [$company, $admin] = $this->seedCompanyUser('admin');

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/voice/transcriptions', [
                'company_id' => $company->id,
                'audio' => UploadedFile::fake()->create('meeting-note.mp3', 120, 'audio/mpeg'),
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.pipeline', 'voice.input.v1')
            ->assertJsonPath('data.company_id', $company->id)
            ->assertJsonPath('data.transcript', 'Voice transcription pipeline is active. Provider transcription integration can now be attached to this endpoint.');
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
        $user = User::factory()->createOne();

        $company->users()->attach($user->id, [
            'role' => $role,
            'joined_at' => now(),
        ]);

        return [$company, $user];
    }
}
