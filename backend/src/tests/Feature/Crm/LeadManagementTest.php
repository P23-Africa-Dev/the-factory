<?php

declare(strict_types=1);

namespace Tests\Feature\Crm;

use App\Models\Company;
use App\Models\Lead;
use App\Models\LeadPipeline;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
}
