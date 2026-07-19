<?php

declare(strict_types=1);

namespace Tests\Feature\Crm;

use App\Models\Company;
use App\Models\Lead;
use App\Models\LeadPipeline;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class LeadManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_create_and_update_lead(): void
    {
        [$company, $admin, $agent, $pipelineId] = $this->seedCompanyUsers();

        $createResponse = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/crm/leads', [
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'name' => 'Acme Prospect',
                'email' => 'lead@example.com',
                'phone' => '+2348000000000',
                'status' => 'newly_lead',
                'priority' => 'high',
                'source' => 'referral',
                'assigned_to_user_id' => $agent->id,
                'next_action' => 'Call tomorrow',
            ]);

        $createResponse->assertCreated()
            ->assertJsonPath('data.lead.company_id', $company->id)
            ->assertJsonPath('data.lead.assigned_to_user_id', $agent->id)
            ->assertJsonPath('data.lead.status', 'newly_lead');

        $leadId = (int) $createResponse->json('data.lead.id');

        $updateResponse = $this->withToken($admin->createToken('admin-token-2', ['*'])->plainTextToken)
            ->patchJson('/api/v1/crm/leads/' . $leadId, [
                'company_id' => $company->id,
                'status' => 'qualified',
                'priority' => 'urgent',
                'last_interaction' => 'Requested formal quote',
            ]);

        $updateResponse->assertOk()
            ->assertJsonPath('data.lead.status', 'qualified')
            ->assertJsonPath('data.lead.priority', 'urgent');
    }

    public function test_agent_can_create_and_only_view_owned_or_assigned_leads(): void
    {
        [$company, $admin, $agent, $pipelineId] = $this->seedCompanyUsers();

        $otherAgent = User::factory()->create(['email_verified_at' => now()]);
        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $otherAgent->id,
            'role' => 'agent',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $assignedLead = Lead::create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $admin->id,
            'assigned_to_user_id' => $agent->id,
            'name' => 'Existing Lead',
            'status' => 'contacted',
            'priority' => 'medium',
        ]);

        $hiddenLead = Lead::create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $admin->id,
            'assigned_to_user_id' => $otherAgent->id,
            'name' => 'Hidden Lead',
            'status' => 'contacted',
            'priority' => 'medium',
        ]);

        $createResponse = $this->withToken($agent->createToken('agent-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/crm/leads', [
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'name' => 'Agent Created',
                'status' => 'newly_lead',
                'priority' => 'low',
            ]);

        $createResponse->assertCreated()
            ->assertJsonPath('data.lead.created_by_user_id', $agent->id)
            ->assertJsonPath('data.lead.assigned_to_user_id', $agent->id);

        $listResponse = $this->withToken($agent->createToken('agent-list-token', ['*'])->plainTextToken)
            ->getJson('/api/v1/crm/leads?company_id=' . $company->id);

        $listResponse->assertOk()
            ->assertJsonPath('data.pagination.total', 2);

        $showResponse = $this->withToken($agent->createToken('agent-show-token', ['*'])->plainTextToken)
            ->getJson('/api/v1/crm/leads/' . $assignedLead->id . '?company_id=' . $company->id);

        $showResponse->assertOk()
            ->assertJsonPath('data.lead.id', $assignedLead->id);

        $hiddenShowResponse = $this->withToken($agent->createToken('agent-hidden-show-token', ['*'])->plainTextToken)
            ->getJson('/api/v1/crm/leads/' . $hiddenLead->id . '?company_id=' . $company->id);

        $hiddenShowResponse->assertUnprocessable()
            ->assertJsonValidationErrors(['authorization']);

        $noteResponse = $this->withToken($agent->createToken('agent-note-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/crm/leads/' . $assignedLead->id . '/notes', [
                'company_id' => $company->id,
                'note' => 'Spoke with lead, awaiting budget confirmation.',
            ]);

        $noteResponse->assertCreated()
            ->assertJsonPath('data.note.lead_id', $assignedLead->id);

        $agentCreatedLeadId = (int) $createResponse->json('data.lead.id');

        $updateStatusResponse = $this->withToken($agent->createToken('agent-update-status', ['*'])->plainTextToken)
            ->patchJson('/api/v1/crm/leads/' . $agentCreatedLeadId, [
                'company_id' => $company->id,
                'status' => 'qualified',
            ]);

        $updateStatusResponse->assertOk()
            ->assertJsonPath('data.lead.status', 'qualified');

        $forbiddenUpdateResponse = $this->withToken($agent->createToken('agent-update-forbidden', ['*'])->plainTextToken)
            ->patchJson('/api/v1/crm/leads/' . $agentCreatedLeadId, [
                'company_id' => $company->id,
                'name' => 'Attempted Rename',
            ]);

        $forbiddenUpdateResponse->assertUnprocessable()
            ->assertJsonValidationErrors(['authorization']);
    }

    public function test_crm_pipeline_returns_stage_counts(): void
    {
        [$company, $admin, $agent, $pipelineId] = $this->seedCompanyUsers();

        Lead::create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $admin->id,
            'assigned_to_user_id' => $agent->id,
            'name' => 'Lead A',
            'status' => 'newly_lead',
            'priority' => 'medium',
        ]);

        Lead::create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $admin->id,
            'assigned_to_user_id' => $agent->id,
            'name' => 'Lead B',
            'status' => 'qualified',
            'priority' => 'high',
        ]);

        $response = $this->withToken($admin->createToken('admin-pipeline-token', ['*'])->plainTextToken)
            ->getJson('/api/v1/crm/leads/pipeline?company_id=' . $company->id);

        $response->assertOk()
            ->assertJsonPath('data.total', 2)
            ->assertJsonPath('data.stages.0.status', 'newly_lead')
            ->assertJsonPath('data.stages.0.count', 1);
    }

    public function test_user_cannot_view_cross_company_lead(): void
    {
        [$company, $admin] = $this->seedCompanyUsers();

        $otherCompany = Company::create([
            'company_id' => 'FAC-CRM002',
            'name' => 'Other CRM Company Ltd',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Cross company CRM test',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $otherAdmin = User::factory()->create(['email_verified_at' => now()]);

        DB::table('company_users')->insert([
            'company_id' => $otherCompany->id,
            'user_id' => $otherAdmin->id,
            'role' => 'admin',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $otherPipeline = LeadPipeline::query()->create([
            'company_id' => $otherCompany->id,
            'name' => 'Other Company Pipeline',
            'currency_code' => 'USD',
            'sort_order' => 0,
            'is_default' => true,
        ]);

        $lead = Lead::create([
            'company_id' => $otherCompany->id,
            'pipeline_id' => $otherPipeline->id,
            'created_by_user_id' => $otherAdmin->id,
            'name' => 'Foreign Lead',
            'status' => 'newly_lead',
            'priority' => 'low',
        ]);

        $response = $this->withToken($admin->createToken('admin-cross-company-token', ['*'])->plainTextToken)
            ->getJson('/api/v1/crm/leads/' . $lead->id . '?company_id=' . $company->id);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['lead']);
    }

    public function test_admin_can_manage_pipelines_labels_and_import_diagnostics(): void
    {
        [$company, $admin,, $pipelineId] = $this->seedCompanyUsers();

        $token = $admin->createToken('admin-crm-management', ['*'])->plainTextToken;

        $createPipeline = $this->withToken($token)
            ->postJson('/api/v1/crm/pipelines', [
                'company_id' => $company->id,
                'name' => 'Events Pipeline',
            ]);

        $createPipeline->assertCreated()
            ->assertJsonPath('data.pipeline.name', 'Events Pipeline')
            ->assertJsonPath('data.pipeline.currency_code', 'USD');

        $createLabel = $this->withToken($token)
            ->postJson('/api/v1/crm/labels', [
                'company_id' => $company->id,
                'name' => 'Follow Up',
                'color' => '#123456',
            ]);

        $createLabel->assertCreated()
            ->assertJsonPath('data.label.name', 'Follow Up');

        $labelId = (int) $createLabel->json('data.label.id');

        $this->withToken($token)
            ->patchJson('/api/v1/crm/labels/' . $labelId, [
                'company_id' => $company->id,
                'name' => 'Follow Up Soon',
                'color' => '#654321',
            ])
            ->assertOk()
            ->assertJsonPath('data.label.name', 'Follow Up Soon');

        $importResponse = $this->withToken($token)
            ->postJson('/api/v1/crm/leads/import', [
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'rows' => [
                    [
                        'name' => 'Import Valid',
                        'email' => 'valid@example.com',
                        'status' => 'newly_lead',
                        'priority' => 'medium',
                    ],
                    [
                        'name' => '',
                        'email' => 'bad-email',
                        'status' => 'unknown_status',
                        'priority' => 'extreme',
                    ],
                ],
            ]);

        $importResponse->assertOk()
            ->assertJsonPath('data.imported_count', 1)
            ->assertJsonCount(1, 'data.failed_rows');
    }

    public function test_agent_upload_overview_scopes_only_agent_uploaded_sources(): void
    {
        [$company, $admin, $agent, $pipelineId] = $this->seedCompanyUsers();

        Lead::create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $agent->id,
            'name' => 'Agent Upload One',
            'status' => 'newly_lead',
            'priority' => 'medium',
            'source' => 'agent upload',
        ]);

        Lead::create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $agent->id,
            'name' => 'Agent Upload Two',
            'status' => 'newly_lead',
            'priority' => 'high',
            'source' => 'uploaded_by_agent',
        ]);

        Lead::create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $admin->id,
            'name' => 'Imported Lead',
            'status' => 'newly_lead',
            'priority' => 'low',
            'source' => 'import',
        ]);

        $response = $this->withToken($admin->createToken('admin-agent-upload-overview', ['*'])->plainTextToken)
            ->getJson('/api/v1/crm/leads/agent-uploads-overview?company_id=' . $company->id);

        $response->assertOk()
            ->assertJsonPath('data.total_uploaded_leads', 2)
            ->assertJsonPath('data.top_agent.id', $agent->id)
            ->assertJsonPath('data.top_agent.total_uploads', 2)
            ->assertJsonPath('data.source_filter', 'agent_upload');

        $listResponse = $this->withToken($admin->createToken('admin-agent-upload-filter', ['*'])->plainTextToken)
            ->getJson('/api/v1/crm/leads?company_id=' . $company->id . '&source=agent_upload');

        $listResponse->assertOk()
            ->assertJsonPath('data.pagination.total', 2);
    }

    public function test_agent_upload_overview_falls_back_to_first_created_agent_when_no_uploads_and_switches_to_top_uploader(): void
    {
        [$company, $admin, $agent, $pipelineId] = $this->seedCompanyUsers();

        $agent->forceFill([
            'name' => 'First Agent',
            'created_at' => now()->subMinutes(10),
            'updated_at' => now()->subMinutes(10),
        ])->save();

        $laterAgent = User::factory()->create([
            'name' => 'Top Uploader Agent',
            'email_verified_at' => now(),
            'created_at' => now()->subMinutes(5),
            'updated_at' => now()->subMinutes(5),
        ]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $laterAgent->id,
            'role' => 'agent',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $noUploadResponse = $this->withToken($admin->createToken('admin-no-upload-overview', ['*'])->plainTextToken)
            ->getJson('/api/v1/crm/leads/agent-uploads-overview?company_id=' . $company->id);

        $noUploadResponse->assertOk()
            ->assertJsonPath('data.total_uploaded_leads', 0)
            ->assertJsonPath('data.top_agent.id', $agent->id)
            ->assertJsonPath('data.top_agent.total_uploads', 0);

        Lead::create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $laterAgent->id,
            'name' => 'Later Agent Upload One',
            'status' => 'newly_lead',
            'priority' => 'medium',
            'source' => 'uploaded by agents',
        ]);

        Lead::create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $laterAgent->id,
            'name' => 'Later Agent Upload Two',
            'status' => 'newly_lead',
            'priority' => 'high',
            'source' => 'agent_upload',
        ]);

        $uploadedResponse = $this->withToken($admin->createToken('admin-after-upload-overview', ['*'])->plainTextToken)
            ->getJson('/api/v1/crm/leads/agent-uploads-overview?company_id=' . $company->id);

        $uploadedResponse->assertOk()
            ->assertJsonPath('data.total_uploaded_leads', 2)
            ->assertJsonPath('data.top_agent.id', $laterAgent->id)
            ->assertJsonPath('data.top_agent.total_uploads', 2);
    }

    public function test_crm_leads_analytics_returns_filtered_totals_and_trends(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-25 12:00:00'));

        [$company, $admin, $agent, $pipelineId] = $this->seedCompanyUsers();

        $secondPipeline = LeadPipeline::query()->create([
            'company_id' => $company->id,
            'name' => 'Secondary Pipeline',
            'currency_code' => 'USD',
            'sort_order' => 2,
            'is_default' => false,
        ]);

        $baseLead = [
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $admin->id,
            'status' => 'newly_lead',
            'priority' => 'medium',
        ];

        $this->createLeadAt(array_merge($baseLead, ['name' => 'Previous Week One']), '2026-06-16 10:00:00');
        $this->createLeadAt(array_merge($baseLead, ['name' => 'Previous Week Two']), '2026-06-17 10:00:00');
        $this->createLeadAt(array_merge($baseLead, ['name' => 'Current Week Mon One']), '2026-06-23 10:00:00');
        $this->createLeadAt(array_merge($baseLead, ['name' => 'Current Week Mon Two']), '2026-06-23 14:00:00');
        $this->createLeadAt(array_merge($baseLead, ['name' => 'Current Week Tues One']), '2026-06-24 10:00:00');
        $this->createLeadAt([
            'company_id' => $company->id,
            'pipeline_id' => $secondPipeline->id,
            'created_by_user_id' => $admin->id,
            'name' => 'Current Week Other Pipeline',
            'status' => 'newly_lead',
            'priority' => 'medium',
        ], '2026-06-24 12:00:00');
        $this->createLeadAt(array_merge($baseLead, ['name' => 'Current Week Wed']), '2026-06-25 10:00:00');
        $this->createLeadAt(array_merge($baseLead, [
            'name' => 'Agent Upload Lead',
            'source' => 'agent upload',
        ]), '2026-06-24 15:00:00');

        $token = $admin->createToken('admin-leads-analytics', ['*'])->plainTextToken;

        $response = $this->withToken($token)
            ->getJson('/api/v1/crm/leads/analytics?company_id=' . $company->id);

        $response->assertOk()
            ->assertJsonPath('data.total_leads', 8)
            ->assertJsonPath('data.week_growth_percent', 200)
            ->assertJsonPath('data.week_growth_direction', 'up')
            ->assertJsonPath('data.month_new_leads', 8)
            ->assertJsonPath('data.month_label', 'June')
            ->assertJsonPath('data.daily_trend.0.day', 'Mon')
            ->assertJsonPath('data.daily_trend.0.value', 0)
            ->assertJsonPath('data.daily_trend.1.day', 'Tues')
            ->assertJsonPath('data.daily_trend.1.value', 2)
            ->assertJsonPath('data.daily_trend.2.day', 'Weds')
            ->assertJsonPath('data.daily_trend.2.value', 3)
            ->assertJsonPath('data.daily_trend.3.day', 'Thurs')
            ->assertJsonPath('data.daily_trend.3.value', 1)
            ->assertJsonPath('data.daily_trend.4.value', 0)
            ->assertJsonPath('data.daily_trend.5.value', 0)
            ->assertJsonPath('data.highlight_day', 'Weds');

        $pipelineResponse = $this->withToken($token)
            ->getJson('/api/v1/crm/leads/analytics?company_id=' . $company->id . '&pipeline_id=' . $pipelineId);

        $pipelineResponse->assertOk()
            ->assertJsonPath('data.total_leads', 7);

        $sourceResponse = $this->withToken($token)
            ->getJson('/api/v1/crm/leads/analytics?company_id=' . $company->id . '&source=agent_upload');

        $sourceResponse->assertOk()
            ->assertJsonPath('data.total_leads', 1);

        Carbon::setTestNow();
    }

    public function test_crm_leads_analytics_scopes_agent_visible_leads(): void
    {
        [$company, $admin, $agent, $pipelineId] = $this->seedCompanyUsers();

        $otherAgent = User::factory()->create(['email_verified_at' => now()]);
        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $otherAgent->id,
            'role' => 'agent',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Lead::create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $admin->id,
            'assigned_to_user_id' => $agent->id,
            'name' => 'Assigned Lead',
            'status' => 'contacted',
            'priority' => 'medium',
        ]);

        Lead::create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $admin->id,
            'assigned_to_user_id' => $otherAgent->id,
            'name' => 'Hidden Lead',
            'status' => 'contacted',
            'priority' => 'medium',
        ]);

        $agentToken = $agent->createToken('agent-scope-analytics', ['*'])->plainTextToken;

        $this->withToken($agentToken)
            ->postJson('/api/v1/crm/leads', [
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'name' => 'Agent Created',
                'status' => 'newly_lead',
                'priority' => 'low',
            ])
            ->assertCreated();

        $this->assertDatabaseCount('leads', 3);

        $this->withToken($agentToken)
            ->getJson('/api/v1/crm/leads?company_id=' . $company->id)
            ->assertOk()
            ->assertJsonPath('data.pagination.total', 2);

        $agentResponse = $this->withToken($agentToken)
            ->getJson('/api/v1/crm/leads/analytics?company_id=' . $company->id);

        $agentResponse->assertOk()
            ->assertJsonPath('data.total_leads', 2);

        $adminResponse = $this->withToken($admin->createToken('admin-agent-scope-analytics', ['*'])->plainTextToken)
            ->getJson('/api/v1/crm/leads/analytics?company_id=' . $company->id);

        $adminResponse->assertOk();

        $this->assertGreaterThanOrEqual(
            (int) $agentResponse->json('data.total_leads'),
            (int) $adminResponse->json('data.total_leads'),
        );
    }

    public function test_admin_can_delete_unused_crm_label(): void
    {
        [$company, $admin] = $this->seedCompanyUsers();

        $token = $admin->createToken('admin-delete-unused-label', ['*'])->plainTextToken;

        $createLabel = $this->withToken($token)
            ->postJson('/api/v1/crm/labels', [
                'company_id' => $company->id,
                'name' => 'Unused Label',
                'color' => '#1D4ED8',
            ]);

        $createLabel->assertCreated();
        $labelId = (int) $createLabel->json('data.label.id');

        $deleteResponse = $this->withToken($token)
            ->postJson('/api/v1/crm/labels/' . $labelId . '/delete', [
                'company_id' => $company->id,
            ]);

        $deleteResponse->assertOk()
            ->assertJsonPath('data.deleted_label_id', $labelId)
            ->assertJsonPath('data.deleted_leads_count', 0);

        $this->assertDatabaseMissing('lead_labels', [
            'id' => $labelId,
            'company_id' => $company->id,
        ]);
    }

    public function test_admin_must_confirm_before_deleting_in_use_crm_label_and_force_delete_reassigns_leads(): void
    {
        [$company, $admin, $agent, $pipelineId] = $this->seedCompanyUsers();

        $token = $admin->createToken('admin-delete-used-label', ['*'])->plainTextToken;

        $createLabel = $this->withToken($token)
            ->postJson('/api/v1/crm/labels', [
                'company_id' => $company->id,
                'name' => 'Needs Follow Up',
                'color' => '#DC2626',
            ]);

        $createLabel->assertCreated();
        $labelId = (int) $createLabel->json('data.label.id');
        $labelSlug = (string) $createLabel->json('data.label.slug');

        $lead = Lead::create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $admin->id,
            'assigned_to_user_id' => $agent->id,
            'name' => 'Label In Use Lead',
            'status' => $labelSlug,
            'priority' => 'high',
        ]);

        $withoutForceResponse = $this->withToken($token)
            ->postJson('/api/v1/crm/labels/' . $labelId . '/delete', [
                'company_id' => $company->id,
            ]);

        $withoutForceResponse->assertUnprocessable()
            ->assertJsonValidationErrors(['label', 'label_usage_count'])
            ->assertJsonPath('errors.label_usage_count.0', '1');

        $forceResponse = $this->withToken($token)
            ->postJson('/api/v1/crm/labels/' . $labelId . '/delete', [
                'company_id' => $company->id,
                'force' => true,
            ]);

        $forceResponse->assertOk()
            ->assertJsonPath('data.deleted_label_id', $labelId)
            ->assertJsonPath('data.deleted_leads_count', 1);

        $lead->refresh();
        $this->assertNotSame($labelSlug, $lead->status);

        $this->assertDatabaseMissing('lead_labels', [
            'id' => $labelId,
            'company_id' => $company->id,
        ]);
    }

    public function test_admin_can_delete_unused_crm_pipeline(): void
    {
        [$company, $admin] = $this->seedCompanyUsers();

        $token = $admin->createToken('admin-delete-unused-pipeline', ['*'])->plainTextToken;

        $createPipeline = $this->withToken($token)
            ->postJson('/api/v1/crm/pipelines', [
                'company_id' => $company->id,
                'name' => 'Temporary Pipeline',
            ]);

        $createPipeline->assertCreated();
        $pipelineId = (int) $createPipeline->json('data.pipeline.id');

        $deleteResponse = $this->withToken($token)
            ->postJson('/api/v1/crm/pipelines/' . $pipelineId . '/delete', [
                'company_id' => $company->id,
            ]);

        $deleteResponse->assertOk()
            ->assertJsonPath('data.deleted_pipeline_id', $pipelineId)
            ->assertJsonPath('data.reassigned_leads_count', 0);

        $this->assertDatabaseMissing('lead_pipelines', [
            'id' => $pipelineId,
            'company_id' => $company->id,
        ]);
    }

    public function test_admin_must_confirm_before_deleting_in_use_crm_pipeline_and_force_delete_reassigns_leads(): void
    {
        [$company, $admin, $agent, $defaultPipelineId] = $this->seedCompanyUsers();

        $token = $admin->createToken('admin-delete-used-pipeline', ['*'])->plainTextToken;

        $createPipeline = $this->withToken($token)
            ->postJson('/api/v1/crm/pipelines', [
                'company_id' => $company->id,
                'name' => 'Pipeline With Leads',
            ]);

        $createPipeline->assertCreated();
        $pipelineId = (int) $createPipeline->json('data.pipeline.id');

        $lead = Lead::create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $admin->id,
            'assigned_to_user_id' => $agent->id,
            'name' => 'Pipeline In Use Lead',
            'status' => 'newly_lead',
            'priority' => 'high',
        ]);

        $withoutForceResponse = $this->withToken($token)
            ->postJson('/api/v1/crm/pipelines/' . $pipelineId . '/delete', [
                'company_id' => $company->id,
            ]);

        $withoutForceResponse->assertUnprocessable()
            ->assertJsonValidationErrors(['pipeline', 'pipeline_usage_count'])
            ->assertJsonPath('errors.pipeline_usage_count.0', '1');

        $forceResponse = $this->withToken($token)
            ->postJson('/api/v1/crm/pipelines/' . $pipelineId . '/delete', [
                'company_id' => $company->id,
                'force' => true,
            ]);

        $forceResponse->assertOk()
            ->assertJsonPath('data.deleted_pipeline_id', $pipelineId)
            ->assertJsonPath('data.reassigned_leads_count', 1)
            ->assertJsonPath('data.reassigned_to_pipeline_id', $defaultPipelineId);

        $lead->refresh();
        $this->assertSame($defaultPipelineId, (int) $lead->pipeline_id);

        $this->assertDatabaseMissing('lead_pipelines', [
            'id' => $pipelineId,
            'company_id' => $company->id,
        ]);
    }

    public function test_admin_cannot_delete_default_crm_pipeline(): void
    {
        [$company, $admin, , $pipelineId] = $this->seedCompanyUsers();

        $token = $admin->createToken('admin-delete-default-pipeline', ['*'])->plainTextToken;

        LeadPipeline::query()->where('id', $pipelineId)->update(['is_default' => true]);

        $this->withToken($token)
            ->postJson('/api/v1/crm/pipelines/' . $pipelineId . '/delete', [
                'company_id' => $company->id,
                'force' => true,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['pipeline']);
    }

    public function test_agent_cannot_delete_crm_pipeline(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();

        $agent->forceFill(['internal_role' => 'agent'])->save();

        $pipeline = LeadPipeline::query()->create([
            'company_id' => $company->id,
            'name' => 'Agent Delete Target',
            'currency_code' => 'USD',
            'sort_order' => 1,
            'is_default' => false,
        ]);

        $agentToken = $agent->createToken('agent-delete-pipeline', ['*'])->plainTextToken;

        $this->withToken($agentToken)
            ->postJson('/api/v1/crm/pipelines/' . $pipeline->id . '/delete', [
                'company_id' => $company->id,
                'force' => true,
            ])
            ->assertForbidden();

        $this->assertDatabaseHas('lead_pipelines', [
            'id' => $pipeline->id,
            'company_id' => $company->id,
        ]);
    }

    public function test_agent_cannot_delete_crm_label(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();

        $adminToken = $admin->createToken('admin-create-label-for-agent-delete', ['*'])->plainTextToken;
        $labelResponse = $this->withToken($adminToken)
            ->postJson('/api/v1/crm/labels', [
                'company_id' => $company->id,
                'name' => 'Agent Restricted Label',
                'color' => '#7C3AED',
            ]);

        $labelResponse->assertCreated();
        $labelId = (int) $labelResponse->json('data.label.id');

        $agentToken = $agent->createToken('agent-delete-label-attempt', ['*'])->plainTextToken;
        $deleteResponse = $this->withToken($agentToken)
            ->postJson('/api/v1/crm/labels/' . $labelId . '/delete', [
                'company_id' => $company->id,
            ]);

        $deleteResponse->assertUnprocessable()
            ->assertJsonValidationErrors(['authorization']);
    }

    public function test_create_lead_persists_budget_fields(): void
    {
        [$company, $admin, , $pipelineId] = $this->seedCompanyUsers();

        $response = $this->withToken($admin->createToken('admin-budget-lead', ['*'])->plainTextToken)
            ->postJson('/api/v1/crm/leads', [
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'name' => 'Budget Prospect',
                'status' => 'newly_lead',
                'priority' => 'medium',
                'budget_amount' => 12500.50,
                'budget_currency' => 'NGN',
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.lead.budget_amount', 12500.5)
            ->assertJsonPath('data.lead.budget_currency', 'NGN');

        $this->assertDatabaseHas('leads', [
            'name' => 'Budget Prospect',
            'budget_amount' => '12500.50',
            'budget_currency' => 'NGN',
        ]);
    }

    public function test_create_lead_persists_professional_fields(): void
    {
        [$company, $admin, , $pipelineId] = $this->seedCompanyUsers();

        $response = $this->withToken($admin->createToken('admin-professional-lead', ['*'])->plainTextToken)
            ->postJson('/api/v1/crm/leads', [
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'name' => 'Jane Prospect',
                'status' => 'newly_lead',
                'priority' => 'medium',
                'company_name' => 'Acme Ltd',
                'website' => 'acme.com',
                'position' => 'Head of Sales',
                'profile_urls' => [
                    'https://linkedin.com/in/jane',
                    'https://x.com/jane',
                ],
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.lead.company_name', 'Acme Ltd')
            ->assertJsonPath('data.lead.website', 'https://acme.com')
            ->assertJsonPath('data.lead.position', 'Head of Sales')
            ->assertJsonPath('data.lead.profile_urls', [
                'https://linkedin.com/in/jane',
                'https://x.com/jane',
            ]);

        $this->assertDatabaseHas('leads', [
            'name' => 'Jane Prospect',
            'company_name' => 'Acme Ltd',
            'website' => 'https://acme.com',
            'position' => 'Head of Sales',
        ]);
    }

    public function test_import_leads_with_professional_fields_and_profile_urls(): void
    {
        [$company, $admin, , $pipelineId] = $this->seedCompanyUsers();

        $response = $this->withToken($admin->createToken('admin-import-professional', ['*'])->plainTextToken)
            ->postJson('/api/v1/crm/leads/import', [
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'duplicate_policy' => 'create',
                'rows' => [[
                    'name' => 'Imported Jane',
                    'email' => 'imported-jane@example.com',
                    'company_name' => 'Imported Co',
                    'website' => 'https://imported.example',
                    'position' => 'Director',
                    'profile_urls' => 'https://linkedin.com/in/imported,https://x.com/imported',
                ]],
            ]);

        $response->assertOk()
            ->assertJsonPath('data.imported_count', 1);

        $this->assertDatabaseHas('leads', [
            'email' => 'imported-jane@example.com',
            'company_name' => 'Imported Co',
            'website' => 'https://imported.example',
            'position' => 'Director',
        ]);

        $lead = Lead::query()->where('email', 'imported-jane@example.com')->first();
        $this->assertNotNull($lead);
        $this->assertSame([
            'https://linkedin.com/in/imported',
            'https://x.com/imported',
        ], $lead->profile_urls);
    }

    public function test_import_rejects_invalid_profile_urls(): void
    {
        [$company, $admin, , $pipelineId] = $this->seedCompanyUsers();

        $response = $this->withToken($admin->createToken('admin-import-invalid-url', ['*'])->plainTextToken)
            ->postJson('/api/v1/crm/leads/import', [
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'duplicate_policy' => 'create',
                'rows' => [[
                    'name' => 'Bad URL Lead',
                    'profile_urls' => 'not-a-valid-url',
                ]],
            ]);

        $response->assertOk()
            ->assertJsonPath('data.imported_count', 0)
            ->assertJsonPath('data.failed_rows.0.row_index', 1);
    }

    public function test_export_includes_professional_fields(): void
    {
        [$company, $admin, , $pipelineId] = $this->seedCompanyUsers();

        Lead::create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $admin->id,
            'name' => 'Professional Export Lead',
            'email' => 'pro-export@example.com',
            'company_name' => 'Export Co',
            'website' => 'https://export.example',
            'position' => 'VP Sales',
            'profile_urls' => ['https://linkedin.com/in/export'],
            'status' => 'newly_lead',
            'priority' => 'medium',
        ]);

        $response = $this->withToken($admin->createToken('admin-export-professional', ['*'])->plainTextToken)
            ->get('/api/v1/crm/leads/export?company_id=' . $company->id . '&format=csv');

        $response->assertOk();
        $content = $response->streamedContent();
        $this->assertStringContainsString('Company Name', $content);
        $this->assertStringContainsString('Profile URLs', $content);
        $this->assertStringContainsString('Export Co', $content);
        $this->assertStringContainsString('https://linkedin.com/in/export', $content);
    }

    public function test_import_duplicate_update_updates_company_name(): void
    {
        [$company, $admin, , $pipelineId] = $this->seedCompanyUsers();

        Lead::create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $admin->id,
            'name' => 'Duplicate Co Lead',
            'email' => 'dup-co@example.com',
            'company_name' => 'Old Co',
            'status' => 'newly_lead',
            'priority' => 'medium',
        ]);

        $response = $this->withToken($admin->createToken('admin-import-dup-co', ['*'])->plainTextToken)
            ->postJson('/api/v1/crm/leads/import', [
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'duplicate_policy' => 'update',
                'rows' => [[
                    'name' => 'Duplicate Co Lead',
                    'email' => 'dup-co@example.com',
                    'company_name' => 'New Co',
                ]],
            ]);

        $response->assertOk()
            ->assertJsonPath('data.updated_count', 1);

        $this->assertDatabaseHas('leads', [
            'email' => 'dup-co@example.com',
            'company_name' => 'New Co',
        ]);
    }

    public function test_legacy_budget_string_is_normalized_on_create(): void
    {
        [$company, $admin, , $pipelineId] = $this->seedCompanyUsers();

        $response = $this->withToken($admin->createToken('admin-legacy-budget', ['*'])->plainTextToken)
            ->postJson('/api/v1/crm/leads', [
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'name' => 'Legacy Budget Lead',
                'status' => 'newly_lead',
                'priority' => 'medium',
                'budget' => 'USD 10000',
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.lead.budget_amount', 10000)
            ->assertJsonPath('data.lead.budget_currency', 'USD');
    }

    public function test_agent_create_normalizes_source_to_agent_upload(): void
    {
        [$company, , $agent, $pipelineId] = $this->seedCompanyUsers();

        $response = $this->withToken($agent->createToken('agent-source-normalize', ['*'])->plainTextToken)
            ->postJson('/api/v1/agent/crm/leads', [
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'name' => 'Agent Source Lead',
                'status' => 'newly_lead',
                'priority' => 'medium',
                'source' => 'agent upload',
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.lead.source', 'agent_upload');
    }

    public function test_agent_create_accepts_explicit_priority(): void
    {
        [$company, , $agent, $pipelineId] = $this->seedCompanyUsers();

        $response = $this->withToken($agent->createToken('agent-priority-create', ['*'])->plainTextToken)
            ->postJson('/api/v1/agent/crm/leads', [
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'name' => 'Urgent Agent Lead',
                'status' => 'newly_lead',
                'priority' => 'urgent',
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.lead.priority', 'urgent');
    }

    public function test_agent_can_read_admin_crm_labels_endpoint(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();

        $adminToken = $admin->createToken('admin-create-label-for-agent-read', ['*'])->plainTextToken;
        $this->withToken($adminToken)
            ->postJson('/api/v1/crm/labels', [
                'company_id' => $company->id,
                'name' => 'Shared Label',
                'color' => '#1D4ED8',
            ])
            ->assertCreated();

        $agentToken = $agent->createToken('agent-read-admin-labels', ['*'])->plainTextToken;
        $this->withToken($agentToken)
            ->getJson('/api/v1/admin/crm/labels?company_id='.$company->id)
            ->assertOk()
            ->assertJsonPath('success', true);
    }

    public function test_import_leads_with_budget_columns(): void
    {
        [$company, $admin, , $pipelineId] = $this->seedCompanyUsers();

        $response = $this->withToken($admin->createToken('admin-import-budget', ['*'])->plainTextToken)
            ->postJson('/api/v1/crm/leads/import', [
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'rows' => [
                    [
                        'name' => 'Imported Budget Lead',
                        'status' => 'newly_lead',
                        'priority' => 'high',
                        'budget_amount' => '5000',
                        'budget_currency' => 'USD',
                    ],
                ],
            ]);

        $response->assertOk()
            ->assertJsonPath('data.imported_count', 1);

        $this->assertDatabaseHas('leads', [
            'name' => 'Imported Budget Lead',
            'budget_amount' => '5000.00',
            'budget_currency' => 'USD',
        ]);
    }

    public function test_import_duplicate_policy_skips_and_updates_matching_leads(): void
    {
        [$company, $admin, , $pipelineId] = $this->seedCompanyUsers();

        Lead::create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $admin->id,
            'name' => 'Existing Duplicate',
            'email' => 'dupe@example.com',
            'status' => 'newly_lead',
            'priority' => 'low',
        ]);

        $skipResponse = $this->withToken($admin->createToken('admin-import-skip', ['*'])->plainTextToken)
            ->postJson('/api/v1/crm/leads/import', [
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'duplicate_policy' => 'skip',
                'rows' => [
                    ['name' => 'Skipped Row', 'email' => 'DUPE@example.com'],
                    ['name' => 'Fresh Lead', 'email' => 'fresh@example.com'],
                ],
            ]);

        $skipResponse->assertOk()
            ->assertJsonPath('data.imported_count', 1)
            ->assertJsonPath('data.skipped_count', 1)
            ->assertJsonPath('data.updated_count', 0)
            ->assertJsonPath('data.skipped_rows.0.row_index', 1);

        $updateResponse = $this->withToken($admin->createToken('admin-import-update', ['*'])->plainTextToken)
            ->postJson('/api/v1/crm/leads/import', [
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'duplicate_policy' => 'update',
                'rows' => [
                    [
                        'name' => 'Updated Duplicate',
                        'email' => 'dupe@example.com',
                        'priority' => 'urgent',
                    ],
                ],
            ]);

        $updateResponse->assertOk()
            ->assertJsonPath('data.imported_count', 0)
            ->assertJsonPath('data.updated_count', 1)
            ->assertJsonPath('data.skipped_count', 0);

        $this->assertDatabaseHas('leads', [
            'email' => 'dupe@example.com',
            'name' => 'Updated Duplicate',
            'priority' => 'urgent',
            'status' => 'newly_lead',
        ]);
    }

    public function test_import_resolves_status_by_label_display_name(): void
    {
        [$company, $admin, , $pipelineId] = $this->seedCompanyUsers();

        $token = $admin->createToken('admin-import-label-name', ['*'])->plainTextToken;

        // Default CRM labels (including "Proposal Sent") are seeded on first CRM call.
        $this->withToken($token)
            ->getJson('/api/v1/crm/labels?company_id=' . $company->id)
            ->assertOk();

        $importResponse = $this->withToken($token)
            ->postJson('/api/v1/crm/leads/import', [
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'rows' => [
                    ['name' => 'By Display Name', 'status' => 'Proposal Sent'],
                    ['name' => 'By Slug', 'status' => 'proposal_sent'],
                ],
            ]);

        $importResponse->assertOk()
            ->assertJsonPath('data.imported_count', 2);

        $this->assertDatabaseHas('leads', [
            'name' => 'By Display Name',
            'status' => 'proposal_sent',
        ]);
    }

    public function test_import_preview_reports_valid_duplicate_and_error_rows(): void
    {
        [$company, $admin, , $pipelineId] = $this->seedCompanyUsers();

        Lead::create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $admin->id,
            'name' => 'Preview Duplicate',
            'email' => 'preview-dupe@example.com',
            'status' => 'newly_lead',
            'priority' => 'medium',
        ]);

        $response = $this->withToken($admin->createToken('admin-import-preview', ['*'])->plainTextToken)
            ->postJson('/api/v1/crm/leads/import/preview', [
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'rows' => [
                    ['name' => 'Ready Row', 'email' => 'ready@example.com'],
                    ['name' => 'Duplicate Row', 'email' => 'preview-dupe@example.com'],
                    ['name' => '', 'email' => 'bad-email'],
                ],
            ]);

        $response->assertOk()
            ->assertJsonPath('data.total_rows', 3)
            ->assertJsonPath('data.valid_count', 1)
            ->assertJsonPath('data.duplicate_count', 1)
            ->assertJsonCount(1, 'data.error_rows')
            ->assertJsonPath('data.duplicate_rows.0.existing_lead_name', 'Preview Duplicate');

        $this->assertDatabaseMissing('leads', ['name' => 'Ready Row']);
    }

    public function test_admin_can_export_leads_csv(): void
    {
        [$company, $admin, $agent, $pipelineId] = $this->seedCompanyUsers();

        Lead::create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $admin->id,
            'assigned_to_user_id' => $agent->id,
            'name' => 'Export Lead One',
            'email' => 'export-one@example.com',
            'status' => 'newly_lead',
            'priority' => 'high',
        ]);

        Lead::create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $admin->id,
            'name' => 'Export Lead Two',
            'status' => 'contacted',
            'priority' => 'low',
        ]);

        $response = $this->withToken($admin->createToken('admin-export-leads', ['*'])->plainTextToken)
            ->get('/api/v1/crm/leads/export?company_id=' . $company->id . '&format=csv');

        $response->assertOk();
        $this->assertStringContainsString('text/csv', (string) $response->headers->get('Content-Type'));

        $content = $response->streamedContent();
        $this->assertStringContainsString('Export Lead One', $content);
        $this->assertStringContainsString('Export Lead Two', $content);
        $this->assertStringContainsString('export-one@example.com', $content);
    }

    public function test_agent_export_scopes_to_accessible_leads(): void
    {
        [$company, $admin, $agent, $pipelineId] = $this->seedCompanyUsers();

        $otherAgent = User::factory()->create(['email_verified_at' => now()]);
        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $otherAgent->id,
            'role' => 'agent',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Lead::create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $admin->id,
            'assigned_to_user_id' => $agent->id,
            'name' => 'Visible Agent Lead',
            'status' => 'contacted',
            'priority' => 'medium',
        ]);

        Lead::create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $admin->id,
            'assigned_to_user_id' => $otherAgent->id,
            'name' => 'Hidden Agent Lead',
            'status' => 'contacted',
            'priority' => 'medium',
        ]);

        $response = $this->withToken($agent->createToken('agent-export-leads', ['*'])->plainTextToken)
            ->get('/api/v1/agent/crm/leads/export?company_id=' . $company->id . '&format=csv');

        $response->assertOk();

        $content = $response->streamedContent();
        $this->assertStringContainsString('Visible Agent Lead', $content);
        $this->assertStringNotContainsString('Hidden Agent Lead', $content);
    }

    public function test_lead_detail_response_includes_full_user_facing_contract(): void
    {
        [$company, $admin, $agent, $pipelineId] = $this->seedCompanyUsers();

        $interactionAt = Carbon::parse('2026-07-01T10:30:00Z');
        $convertedAt = Carbon::parse('2026-07-10T12:00:00Z');

        $lead = Lead::create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $admin->id,
            'assigned_to_user_id' => $agent->id,
            'name' => 'Detail Contract Lead',
            'email' => 'detail@example.com',
            'phone' => '+2348000000001',
            'location' => 'Ikeja GRA',
            'company_name' => 'Acme Ltd',
            'website' => 'https://acme.com',
            'position' => 'Head of Sales',
            'profile_urls' => ['https://linkedin.com/in/detail'],
            'source' => 'referral',
            'status' => 'qualified',
            'priority' => 'high',
            'budget_amount' => 12500.50,
            'budget_currency' => 'NGN',
            'next_action' => 'Send proposal',
            'last_interaction' => 'Requested formal quote',
            'last_interaction_at' => $interactionAt,
            'converted_at' => $convertedAt,
            'meta' => ['note' => 'internal-only'],
        ]);

        $adminResponse = $this->withToken($admin->createToken('admin-detail-contract', ['*'])->plainTextToken)
            ->getJson('/api/v1/crm/leads/' . $lead->id . '?company_id=' . $company->id);

        $adminResponse->assertOk()
            ->assertJsonPath('data.lead.id', $lead->id)
            ->assertJsonPath('data.lead.email', 'detail@example.com')
            ->assertJsonPath('data.lead.company_name', 'Acme Ltd')
            ->assertJsonPath('data.lead.website', 'https://acme.com')
            ->assertJsonPath('data.lead.position', 'Head of Sales')
            ->assertJsonPath('data.lead.profile_urls.0', 'https://linkedin.com/in/detail')
            ->assertJsonPath('data.lead.budget_amount', 12500.5)
            ->assertJsonPath('data.lead.budget_currency', 'NGN')
            ->assertJsonPath('data.lead.budget', 'NGN 12500.50')
            ->assertJsonPath('data.lead.pipeline.id', $pipelineId)
            ->assertJsonPath('data.lead.pipeline.name', 'Default Pipeline')
            ->assertJsonPath('data.lead.pipeline.currency_code', 'USD')
            ->assertJsonPath('data.lead.creator.id', $admin->id)
            ->assertJsonPath('data.lead.creator.name', $admin->name)
            ->assertJsonPath('data.lead.assignee.id', $agent->id)
            ->assertJsonPath('data.lead.assignee.name', $agent->name)
            ->assertJsonPath('data.lead.linked_to_map', false)
            ->assertJsonPath('data.lead.last_interaction', 'Requested formal quote')
            ->assertJsonPath('data.lead.meta.note', 'internal-only');

        $leadPayload = $adminResponse->json('data.lead');
        $this->assertArrayNotHasKey('deleted_at', $leadPayload);
        $this->assertNotEmpty($leadPayload['last_interaction_at']);
        $this->assertNotEmpty($leadPayload['converted_at']);
        $this->assertNotEmpty($leadPayload['created_at']);
        $this->assertNotEmpty($leadPayload['updated_at']);

        $agentResponse = $this->withToken($agent->createToken('agent-detail-contract', ['*'])->plainTextToken)
            ->getJson('/api/v1/crm/leads/' . $lead->id . '?company_id=' . $company->id);

        $agentResponse->assertOk()
            ->assertJsonPath('data.lead.email', 'detail@example.com')
            ->assertJsonPath('data.lead.pipeline.name', 'Default Pipeline')
            ->assertJsonPath('data.lead.budget_currency', 'NGN');

        $this->assertArrayNotHasKey('deleted_at', $agentResponse->json('data.lead'));
    }

    private function seedCompanyUsers(): array
    {
        $company = Company::create([
            'company_id' => 'FAC-CRM001',
            'name' => 'CRM Factory Ltd',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'CRM management',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $admin = User::factory()->create(['email_verified_at' => now()]);
        $agent = User::factory()->create(['email_verified_at' => now()]);

        DB::table('company_users')->insert([
            [
                'company_id' => $company->id,
                'user_id' => $admin->id,
                'role' => 'admin',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'company_id' => $company->id,
                'user_id' => $agent->id,
                'role' => 'agent',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        $pipeline = LeadPipeline::query()->create([
            'company_id' => $company->id,
            'name' => 'Default Pipeline',
            'currency_code' => 'USD',
            'sort_order' => 0,
            'is_default' => true,
        ]);

        return [$company, $admin, $agent, $pipeline->id];
    }

    /**
     * @param array<string, mixed> $attributes
     */
    private function createLeadAt(array $attributes, string $createdAt): Lead
    {
        $lead = Lead::create($attributes);

        DB::table('leads')->where('id', $lead->id)->update([
            'created_at' => $createdAt,
            'updated_at' => $createdAt,
        ]);

        return $lead->fresh();
    }
}
