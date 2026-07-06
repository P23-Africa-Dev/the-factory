<?php

declare(strict_types=1);

namespace Tests\Feature\AI;

use App\Models\Company;
use App\Models\Lead;
use App\Models\LeadPipeline;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

final class CopilotCrmSendEmailTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'services.ai.enable_read_synthesis' => false,
            'services.ai.enable_hybrid_router' => false,
        ]);
    }

    public function test_follow_up_action_preview_resolves_lead_name_email_and_sender_signature(): void
    {
        [$company, $owner, $pipelineId] = $this->seedOwnerWithPipeline();

        Lead::query()->create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $owner->id,
            'name' => 'Faith University',
            'email' => 'contact@faithuniversity.edu',
            'status' => 'contacted',
            'priority' => 'medium',
            'source' => 'manual',
            'location' => 'Ora Ekpen 36, Lagos 10, Lagos, Nigeria',
        ]);

        $response = $this
            ->actingAs($owner)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Send a follow-up to Faith University',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'crm.send_email');

        $actionArgs = $response->json('data.response.payload.action_args');
        $this->assertIsArray($actionArgs);
        $this->assertSame('Faith University', $actionArgs['lead_name'] ?? null);
        $this->assertSame('contact@faithuniversity.edu', $actionArgs['lead_email'] ?? null);
        $this->assertSame('contact@faithuniversity.edu', $actionArgs['to'][0]['email'] ?? null);
        $this->assertStringContainsString('Faith University', (string) ($actionArgs['subject'] ?? ''));
        $this->assertStringNotContainsString('[Your Name]', (string) ($actionArgs['body_text'] ?? ''));
        $this->assertStringContainsString($owner->name, (string) ($actionArgs['body_text'] ?? ''));
        $this->assertTrue($response->json('data.response.payload.confirmation_required'));
    }

    /**
     * @return array{0: Company, 1: User, 2: int}
     */
    private function seedOwnerWithPipeline(): array
    {
        $company = Company::query()->create([
            'company_id' => strtoupper(Str::random(10)),
            'name' => 'Factory CRM Email',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Operations management',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $owner = User::factory()->createOne(['is_active' => true, 'name' => 'Tommy Shelby']);
        $company->users()->attach($owner->id, ['role' => 'owner', 'joined_at' => now()]);

        $pipelineId = (int) LeadPipeline::query()->create([
            'company_id' => $company->id,
            'name' => 'Default Pipeline',
            'is_default' => true,
        ])->id;

        return [$company, $owner, $pipelineId];
    }
}
