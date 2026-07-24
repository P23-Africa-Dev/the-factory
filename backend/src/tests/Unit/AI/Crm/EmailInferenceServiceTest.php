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
        $this->assertNotSame('', trim((string) ($result['subject'] ?? '')));
        $this->assertStringNotContainsString('[Your Name]', (string) ($result['body_text'] ?? ''));
        $this->assertDoesNotMatchRegularExpression('/^\s*Subject\s*:/i', (string) ($result['body_text'] ?? ''));
        $this->assertStringContainsString($owner->name, (string) ($result['body_text'] ?? ''));
    }

    public function test_infer_prefers_named_lead_over_list_fallback_and_strips_intent_clause(): void
    {
        [$company, $owner, $pipelineId] = $this->seedCompanyOwner();

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

        $memory = $this->app->make(ConversationMemoryService::class);
        $thread = $memory->appendMessage(
            (int) $company->id,
            (int) $owner->id,
            null,
            'user',
            'Show leads',
        );
        $threadId = (string) $thread['thread_id'];
        $memory->appendMessage(
            (int) $company->id,
            (int) $owner->id,
            $threadId,
            'assistant',
            'Here are leads.',
            ['crm.top_leads'],
            'crm.top_leads',
            [
                'items' => [
                    ['id' => 1, 'name' => 'Demo Lead'],
                    ['id' => $deen->id, 'name' => 'Deen Dan'],
                ],
            ],
        );

        $service = $this->app->make(EmailInferenceService::class);
        $result = $service->infer(
            message: 'send email to deen active to find out if we will be getting an update from them soon about factory 23',
            companyId: (int) $company->id,
            conversationSummary: 'User previously discussed task creation prompts appearing for CRM leads.',
            userId: (int) $owner->id,
            threadId: $threadId,
        );

        $this->assertSame((int) $deen->id, $result['lead_id'] ?? null);
        $this->assertSame('Deen Dan', $result['lead_name'] ?? null);
        $this->assertStringContainsStringIgnoringCase('factory', (string) ($result['subject'] ?? ''));
        $this->assertDoesNotMatchRegularExpression('/^\s*Subject\s*:/i', (string) ($result['body_text'] ?? ''));
    }

    public function test_peel_subject_from_body_via_normalize(): void
    {
        [$company, $owner] = $this->seedCompanyOwner();
        $service = $this->app->make(EmailInferenceService::class);

        $normalized = $service->normalizeProvidedArgs((int) $company->id, [
            'subject' => 'Follow-up: Demo Lead',
            'body_text' => "Subject: Factory23 update\n\nDear Deen,\n\nPlease share an update.\n\nBest regards,\nTommy",
            'lead_name' => 'Deen Dan',
        ], (int) $owner->id);

        $this->assertSame('Factory23 update', $normalized['subject'] ?? null);
        $this->assertStringStartsWith('Dear Deen', (string) ($normalized['body_text'] ?? ''));
        $this->assertDoesNotMatchRegularExpression('/^\s*Subject\s*:/i', (string) ($normalized['body_text'] ?? ''));
    }

    public function test_fresh_email_detection_helpers(): void
    {
        $service = $this->app->make(EmailInferenceService::class);

        $this->assertTrue($service->looksLikeFreshEmailRequest(
            'send email to deen active to find out if we will be getting an update from them soon about factory 23'
        ));
        $this->assertFalse($service->looksLikeEmailFieldCorrection(
            'send email to deen active to find out if we will be getting an update from them soon about factory 23'
        ));
        $this->assertTrue($service->looksLikeEmailReset('forget the 5pm thing and reason well'));
        $this->assertTrue($service->looksLikeEmailFieldCorrection('change the subject to Factory23 update'));
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
