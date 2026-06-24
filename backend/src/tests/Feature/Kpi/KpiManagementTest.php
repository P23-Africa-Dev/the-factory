<?php

declare(strict_types=1);

namespace Tests\Feature\Kpi;

use App\Models\Company;
use App\Models\Kpi;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class KpiManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_can_create_kpi_with_assignee(): void
    {
        [$company, $owner, $admin, $agent] = $this->seedCompanyUsers();

        $response = $this->withToken($owner->createToken('owner-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/kpis', [
                'company_id' => $company->company_id,
                'name' => 'New Retailer Acquisition',
                'category' => 'sales',
                'objective' => 'Acquire new retailers in the target region.',
                'target_value' => '50 visits',
                'expected_outcome' => 'Reach 50 qualified retailer sign-ups.',
                'start_date' => now()->toDateString(),
                'end_date' => now()->addMonth()->toDateString(),
                'priority' => 'high',
                'assigned_to' => (string) $agent->id,
            ]);

        $response->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.kpi.name', 'New Retailer Acquisition')
            ->assertJsonPath('data.kpi.assigned_to_user_id', $agent->id)
            ->assertJsonPath('data.kpi.status', 'pending');

        $this->assertDatabaseHas('kpis', [
            'company_id' => $company->id,
            'name' => 'New Retailer Acquisition',
            'assigned_to_user_id' => $agent->id,
        ]);
    }

    public function test_owner_can_list_kpis_with_status_cards(): void
    {
        [$company, $owner] = $this->seedCompanyUsers();

        Kpi::create([
            'company_id' => $company->id,
            'created_by_user_id' => $owner->id,
            'name' => 'Pending KPI',
            'category' => 'sales',
            'objective' => 'Objective one',
            'target_value' => '10',
            'expected_outcome' => 'Outcome one',
            'priority' => 'medium',
            'status' => 'pending',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addWeek()->toDateString(),
        ]);

        Kpi::create([
            'company_id' => $company->id,
            'created_by_user_id' => $owner->id,
            'name' => 'Completed KPI',
            'category' => 'survey',
            'objective' => 'Objective two',
            'target_value' => '20',
            'expected_outcome' => 'Outcome two',
            'priority' => 'low',
            'status' => 'completed',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addWeek()->toDateString(),
            'completed_at' => now(),
        ]);

        $response = $this->withToken($owner->createToken('owner-token', ['*'])->plainTextToken)
            ->getJson('/api/v1/kpis?company_id=' . $company->company_id);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(2, 'data.items')
            ->assertJsonPath('data.status_cards.total', 2)
            ->assertJsonPath('data.status_cards.completion_rate', 50);
    }

    public function test_owner_can_update_and_delete_kpi(): void
    {
        [$company, $owner] = $this->seedCompanyUsers();

        $kpi = Kpi::create([
            'company_id' => $company->id,
            'created_by_user_id' => $owner->id,
            'name' => 'Editable KPI',
            'category' => 'collection',
            'objective' => 'Collect outstanding payments.',
            'target_value' => '100k',
            'expected_outcome' => 'Collect 100k in receivables.',
            'priority' => 'medium',
            'status' => 'pending',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addMonth()->toDateString(),
        ]);

        $this->withToken($owner->createToken('owner-token', ['*'])->plainTextToken)
            ->patchJson('/api/v1/kpis/' . $kpi->id, [
                'company_id' => $company->company_id,
                'name' => 'Updated KPI Name',
            ])
            ->assertOk()
            ->assertJsonPath('data.kpi.name', 'Updated KPI Name');

        $this->withToken($owner->createToken('owner-token-2', ['*'])->plainTextToken)
            ->deleteJson('/api/v1/kpis/' . $kpi->id, [
                'company_id' => $company->company_id,
            ])
            ->assertOk()
            ->assertJsonPath('success', true);

        $this->assertSoftDeleted('kpis', ['id' => $kpi->id]);
    }

    public function test_management_can_move_kpi_status_via_admin_route(): void
    {
        [$company, $owner] = $this->seedCompanyUsers();

        $kpi = Kpi::create([
            'company_id' => $company->id,
            'created_by_user_id' => $owner->id,
            'name' => 'Status KPI',
            'category' => 'lead_generation',
            'objective' => 'Generate qualified leads.',
            'target_value' => '30 leads',
            'expected_outcome' => 'Deliver 30 qualified leads.',
            'priority' => 'high',
            'status' => 'pending',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addMonth()->toDateString(),
        ]);

        $this->withToken($owner->createToken('owner-token', ['*'])->plainTextToken)
            ->patchJson('/api/v1/admin/kpis/' . $kpi->id . '/status', [
                'company_id' => $company->company_id,
                'status' => 'in_progress',
            ])
            ->assertOk()
            ->assertJsonPath('data.kpi.status', 'in_progress');

        $this->assertDatabaseHas('kpis', [
            'id' => $kpi->id,
            'status' => 'in_progress',
        ]);
    }

    public function test_agent_cannot_create_kpi(): void
    {
        [$company,,, $agent] = $this->seedCompanyUsers();

        $this->withToken($agent->createToken('agent-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/kpis', [
                'company_id' => $company->company_id,
                'name' => 'Agent KPI',
                'category' => 'sales',
                'objective' => 'Agent should not create this KPI.',
                'target_value' => '1',
                'expected_outcome' => 'Should fail authorization.',
                'start_date' => now()->toDateString(),
                'end_date' => now()->addWeek()->toDateString(),
                'priority' => 'low',
            ])
            ->assertUnprocessable()
            ->assertJsonPath('errors.authorization.0', 'Only owners, admins, and supervisors can manage KPIs.');
    }

    public function test_agent_can_list_only_assigned_kpis(): void
    {
        [$company, $owner,, $agent] = $this->seedCompanyUsers();

        Kpi::create([
            'company_id' => $company->id,
            'created_by_user_id' => $owner->id,
            'assigned_to_user_id' => $agent->id,
            'name' => 'Assigned KPI',
            'category' => 'sales',
            'objective' => 'Assigned to agent.',
            'target_value' => '5',
            'expected_outcome' => 'Complete assigned work.',
            'priority' => 'medium',
            'status' => 'pending',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addWeek()->toDateString(),
        ]);

        Kpi::create([
            'company_id' => $company->id,
            'created_by_user_id' => $owner->id,
            'name' => 'Unassigned KPI',
            'category' => 'sales',
            'objective' => 'Not assigned to agent.',
            'target_value' => '5',
            'expected_outcome' => 'Hidden from agent.',
            'priority' => 'medium',
            'status' => 'pending',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addWeek()->toDateString(),
        ]);

        $response = $this->withToken($agent->createToken('agent-token', ['*'])->plainTextToken)
            ->getJson('/api/v1/agent/kpis?company_id=' . $company->company_id);

        $response->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.name', 'Assigned KPI');
    }

    public function test_agent_can_update_status_on_assigned_kpi(): void
    {
        [$company, $owner,, $agent] = $this->seedCompanyUsers();

        $kpi = Kpi::create([
            'company_id' => $company->id,
            'created_by_user_id' => $owner->id,
            'assigned_to_user_id' => $agent->id,
            'name' => 'Agent Status KPI',
            'category' => 'customer_visits',
            'objective' => 'Visit assigned accounts.',
            'target_value' => '10 visits',
            'expected_outcome' => 'Complete visits.',
            'priority' => 'medium',
            'status' => 'pending',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addWeek()->toDateString(),
        ]);

        $this->withToken($agent->createToken('agent-token', ['*'])->plainTextToken)
            ->patchJson('/api/v1/agent/kpis/' . $kpi->id . '/status', [
                'company_id' => $company->company_id,
                'status' => 'in_progress',
            ])
            ->assertOk()
            ->assertJsonPath('data.kpi.status', 'in_progress');
    }

    public function test_list_supports_search_and_status_filter(): void
    {
        [$company, $owner] = $this->seedCompanyUsers();

        Kpi::create([
            'company_id' => $company->id,
            'created_by_user_id' => $owner->id,
            'name' => 'Searchable Retail KPI',
            'category' => 'merchandising',
            'objective' => 'Merchandising objective.',
            'target_value' => '15',
            'expected_outcome' => 'Merchandising outcome.',
            'priority' => 'medium',
            'status' => 'pending',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addWeek()->toDateString(),
        ]);

        Kpi::create([
            'company_id' => $company->id,
            'created_by_user_id' => $owner->id,
            'name' => 'Other KPI',
            'category' => 'survey',
            'objective' => 'Survey objective.',
            'target_value' => '8',
            'expected_outcome' => 'Survey outcome.',
            'priority' => 'low',
            'status' => 'completed',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addWeek()->toDateString(),
            'completed_at' => now(),
        ]);

        $this->withToken($owner->createToken('owner-token', ['*'])->plainTextToken)
            ->getJson('/api/v1/kpis?company_id=' . $company->company_id . '&search=Retail')
            ->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.name', 'Searchable Retail KPI');

        $this->withToken($owner->createToken('owner-token-2', ['*'])->plainTextToken)
            ->getJson('/api/v1/kpis?company_id=' . $company->company_id . '&status=completed')
            ->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.name', 'Other KPI');
    }

    /**
     * @return array{0: Company, 1: User, 2: User, 3: User}
     */
    private function seedCompanyUsers(): array
    {
        $company = Company::create([
            'company_id' => 'FAC-KPIBASE',
            'name' => 'KPI Company',
            'country' => 'NG',
            'currency_code' => 'NGN',
            'team_size' => '11-50',
            'use_case' => 'operations',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $owner = User::factory()->create(['email_verified_at' => now()]);
        $admin = User::factory()->create(['email_verified_at' => now()]);
        $agent = User::factory()->create(['email_verified_at' => now()]);

        $this->attachCompanyRole($company->id, $owner->id, 'owner');
        $this->attachCompanyRole($company->id, $admin->id, 'admin');
        $this->attachCompanyRole($company->id, $agent->id, 'agent');

        return [$company, $owner, $admin, $agent];
    }

    private function attachCompanyRole(int $companyId, int $userId, string $role): void
    {
        DB::table('company_users')->insert([
            'company_id' => $companyId,
            'user_id' => $userId,
            'role' => $role,
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
