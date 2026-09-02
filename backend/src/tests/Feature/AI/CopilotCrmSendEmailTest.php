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
        $this->assertStringContainsString('Faith University', (string) ($actionArgs['lead_name'] ?? ''));
        $this->assertNotSame('', trim((string) ($actionArgs['subject'] ?? '')));
        $this->assertStringNotContainsString('[Your Name]', (string) ($actionArgs['body_text'] ?? ''));
        $this->assertStringContainsString($owner->name, (string) ($actionArgs['body_text'] ?? ''));
        $this->assertDoesNotMatchRegularExpression('/^\s*Subject\s*:/i', (string) ($actionArgs['body_text'] ?? ''));
        $this->assertTrue($response->json('data.response.payload.confirmation_required'));
    }

    public function test_fresh_email_request_with_update_word_does_not_reuse_sticky_draft(): void
    {
        [$company, $owner, $pipelineId] = $this->seedOwnerWithPipeline();

        $deen = Lead::query()->create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $owner->id,
            'name' => 'Deen Dan',
            'email' => 'nurudeen@p23africa.com',
            'status' => 'contacted',
            'priority' => 'medium',
            'source' => 'manual',
            'location' => 'Lagos, Nigeria',
        ]);

        Lead::query()->create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $owner->id,
            'name' => 'Demo Lead',
            'email' => 'demolead@yopmail.com',
            'status' => 'contacted',
            'priority' => 'medium',
            'source' => 'manual',
            'location' => 'Lagos, Nigeria',
        ]);

        $first = $this
            ->actingAs($owner)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'send email to deen about our 5pm meeting follow up',
            ]);

        $first->assertOk()->assertJsonPath('data.response.tool', 'crm.send_email');
        $threadId = (string) $first->json('data.thread_id');
        $this->assertNotSame('', $threadId);

        $second = $this
            ->actingAs($owner)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'thread_id' => $threadId,
                'message' => 'forget previous draft. reason well. send email to deen to find out if we will be getting an update from them soon about factory 23.',
            ]);

        $second->assertOk()->assertJsonPath('data.response.tool', 'crm.send_email');
        $args = $second->json('data.response.payload.action_args');
        $this->assertIsArray($args);
        $this->assertSame((int) $deen->id, $args['lead_id'] ?? null);
        $this->assertSame('Deen Dan', $args['lead_name'] ?? null);
        $combined = strtolower((string) ($args['subject'] ?? '') . ' ' . (string) ($args['body_text'] ?? ''));
        $this->assertStringContainsString('factory', $combined);
        $this->assertDoesNotMatchRegularExpression('/^\s*Subject\s*:/i', (string) ($args['body_text'] ?? ''));
    }

    public function test_email_regenerate_and_enhance_endpoints_return_previous_and_new_draft(): void
    {
        [$company, $owner, $pipelineId] = $this->seedOwnerWithPipeline();

        $lead = Lead::query()->create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $owner->id,
            'name' => 'Deen Dan',
            'email' => 'nurudeen@p23africa.com',
            'status' => 'contacted',
            'priority' => 'medium',
            'source' => 'manual',
            'location' => 'Lagos, Nigeria',
        ]);

        $regen = $this
            ->actingAs($owner)
            ->postJson('/api/v1/copilot/email/regenerate', [
                'company_id' => $company->id,
                'lead_id' => $lead->id,
                'to_email' => 'nurudeen@p23africa.com',
                'subject' => 'Old subject',
                'body_text' => 'Old body about the 5pm meeting.',
                'user_note' => 'Ask for a Factory23 update.',
            ]);

        $regen->assertOk();
        $this->assertSame('Old subject', $regen->json('data.previous.subject'));
        $this->assertNotSame('', trim((string) $regen->json('data.subject')));
        $this->assertNotSame('', trim((string) $regen->json('data.body_text')));
        $this->assertDoesNotMatchRegularExpression('/^\s*Subject\s*:/i', (string) $regen->json('data.body_text'));

        $enhance = $this
            ->actingAs($owner)
            ->postJson('/api/v1/copilot/email/enhance', [
                'company_id' => $company->id,
                'lead_id' => $lead->id,
                'to_email' => 'nurudeen@p23africa.com',
                'subject' => 'Factory23 update',
                'body_text' => 'hi deen, pls tell us if factory23 update is coming soon thanks tommy',
            ]);

        $enhance->assertOk();
        $this->assertSame('Factory23 update', $enhance->json('data.previous.subject'));
        $this->assertNotSame('', trim((string) $enhance->json('data.body_text')));
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
