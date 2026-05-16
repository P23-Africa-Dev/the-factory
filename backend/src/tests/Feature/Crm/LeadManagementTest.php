<?php

declare(strict_types=1);

namespace Tests\Feature\Crm;

use App\Models\Company;
use App\Models\Lead;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class LeadManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_create_and_update_lead(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();

        $createResponse = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/crm/leads', [
                'company_id' => $company->id,
                'name' => 'Acme Prospect',
                'email' => 'lead@example.com',
                'phone' => '+2348000000000',
                'status' => 'new',
                'priority' => 'high',
                'source' => 'referral',
                'assigned_to_user_id' => $agent->id,
                'next_action' => 'Call tomorrow',
            ]);

        $createResponse->assertCreated()
            ->assertJsonPath('data.lead.company_id', $company->id)
            ->assertJsonPath('data.lead.assigned_to_user_id', $agent->id)
            ->assertJsonPath('data.lead.status', 'new');

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

    public function test_agent_cannot_create_lead_but_can_list_show_and_add_notes(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();

        $lead = Lead::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'assigned_to_user_id' => $agent->id,
            'name' => 'Existing Lead',
            'status' => 'contacted',
            'priority' => 'medium',
        ]);

        $createResponse = $this->withToken($agent->createToken('agent-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/crm/leads', [
                'company_id' => $company->id,
                'name' => 'Agent Attempt',
                'status' => 'new',
                'priority' => 'low',
            ]);

        $createResponse->assertUnprocessable()
            ->assertJsonValidationErrors(['authorization']);

        $listResponse = $this->withToken($agent->createToken('agent-list-token', ['*'])->plainTextToken)
            ->getJson('/api/v1/crm/leads?company_id=' . $company->id);

        $listResponse->assertOk()
            ->assertJsonPath('data.items.0.id', $lead->id);

        $showResponse = $this->withToken($agent->createToken('agent-show-token', ['*'])->plainTextToken)
            ->getJson('/api/v1/crm/leads/' . $lead->id . '?company_id=' . $company->id);

        $showResponse->assertOk()
            ->assertJsonPath('data.lead.id', $lead->id);

        $noteResponse = $this->withToken($agent->createToken('agent-note-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/crm/leads/' . $lead->id . '/notes', [
                'company_id' => $company->id,
                'note' => 'Spoke with lead, awaiting budget confirmation.',
            ]);

        $noteResponse->assertCreated()
            ->assertJsonPath('data.note.lead_id', $lead->id);
    }

    public function test_crm_pipeline_returns_stage_counts(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();

        Lead::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'assigned_to_user_id' => $agent->id,
            'name' => 'Lead A',
            'status' => 'new',
            'priority' => 'medium',
        ]);

        Lead::create([
            'company_id' => $company->id,
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
            ->assertJsonPath('data.stages.0.status', 'new')
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

        $lead = Lead::create([
            'company_id' => $otherCompany->id,
            'created_by_user_id' => $otherAdmin->id,
            'name' => 'Foreign Lead',
            'status' => 'new',
            'priority' => 'low',
        ]);

        $response = $this->withToken($admin->createToken('admin-cross-company-token', ['*'])->plainTextToken)
            ->getJson('/api/v1/crm/leads/' . $lead->id . '?company_id=' . $company->id);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['lead']);
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

        return [$company, $admin, $agent];
    }
}
