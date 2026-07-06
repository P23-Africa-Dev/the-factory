<?php

declare(strict_types=1);

namespace Tests\Unit\AI\Crm;

use App\Models\Company;
use App\Models\Lead;
use App\Models\LeadPipeline;
use App\Models\User;
use App\Services\AI\Context\ConversationMemoryService;
use App\Services\AI\Crm\EmailInferenceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

final class EmailInferenceServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_infer_resolves_lead_name_from_follow_up_message_and_populates_recipient(): void
    {
        [$company, $owner, $pipelineId] = $this->seedCompanyOwner();

        Lead::query()->create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $owner->id,
            'name' => 'Faith University',
            'email' => 'contact@faithuniversity.edu',
            'status' => 'contacted',
            'priority' => 'medium',
            'source' => 'manual',
            'location' => 'Lagos, Nigeria',
        ]);

        $service = $this->app->make(EmailInferenceService::class);
        $result = $service->infer(
            message: 'Send a follow-up to Faith University',
            companyId: (int) $company->id,
            userId: (int) $owner->id,
        );

        $this->assertSame((int) Lead::query()->where('name', 'Faith University')->value('id'), $result['lead_id'] ?? null);
        $this->assertSame('Faith University', $result['lead_name'] ?? null);
        $this->assertSame('contact@faithuniversity.edu', $result['lead_email'] ?? null);
        $this->assertSame('contact@faithuniversity.edu', $result['to'][0]['email'] ?? null);
        $this->assertStringContainsString('Follow-up: Faith University', (string) ($result['subject'] ?? ''));
        $this->assertStringNotContainsString('[Your Name]', (string) ($result['body_text'] ?? ''));
        $this->assertStringContainsString($owner->name, (string) ($result['body_text'] ?? ''));
    }

    public function test_infer_resolves_lead_from_recent_thread_top_leads_payload(): void
    {
        [$company, $owner, $pipelineId] = $this->seedCompanyOwner();

        $lead = Lead::query()->create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $owner->id,
            'name' => 'Faith University',
            'email' => 'hello@faithuniversity.edu',
            'status' => 'contacted',
            'priority' => 'medium',
            'source' => 'manual',
            'location' => 'Lagos, Nigeria',
        ]);

        $memory = $this->app->make(ConversationMemoryService::class);
        $thread = $memory->appendMessage(
            (int) $company->id,
            (int) $owner->id,
            null,
            'user',
            'Show all Lagos leads',
        );

        $threadId = (string) $thread['thread_id'];

        $memory->appendMessage(
            (int) $company->id,
            (int) $owner->id,
            $threadId,
            'assistant',
            'Here are your Lagos leads.',
            ['crm.top_leads'],
            'crm.top_leads',
            [
                'items' => [
                    ['id' => $lead->id, 'name' => 'Faith University', 'location' => 'Lagos, Nigeria'],
                ],
            ],
        );

        $service = $this->app->make(EmailInferenceService::class);
        $result = $service->infer(
            message: 'Send a follow-up to Faith University',
            companyId: (int) $company->id,
            userId: (int) $owner->id,
            threadId: $threadId,
        );

        $this->assertSame((int) $lead->id, $result['lead_id'] ?? null);
        $this->assertSame('hello@faithuniversity.edu', $result['to'][0]['email'] ?? null);
    }

    public function test_warning_codes_flag_missing_lead_and_recipient(): void
    {
        $service = $this->app->make(EmailInferenceService::class);

        $codes = $service->warningCodes([
            'subject' => 'Follow-up',
            'body_text' => 'Hello there',
        ]);

        $this->assertContains('lead_unresolved', $codes);
        $this->assertContains('recipient_email_missing', $codes);
    }

    /**
     * @return array{0: Company, 1: User, 2: int}
     */
    private function seedCompanyOwner(): array
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
