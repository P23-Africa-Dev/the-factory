<?php

declare(strict_types=1);

namespace Tests\Feature\Internal;

use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class InternalUserFetchTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_user_can_fetch_internal_users_from_company(): void
    {
        $company = Company::create([
            'company_id' => 'FAC-INT-FETCH',
            'name' => 'Internal Fetch Test Co',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'User fetch testing',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $owner = User::factory()->create(['internal_role' => null]);
        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $owner->id,
            'role' => 'owner',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $supervisor1 = User::factory()->create([
            'name' => 'Alice Supervisor',
            'email' => 'alice-sup@factory.test',
            'internal_role' => 'supervisor',
            'is_active' => true,
        ]);
        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $supervisor1->id,
            'role' => 'supervisor',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $supervisor2 = User::factory()->create([
            'name' => 'Bob Supervisor',
            'email' => 'bob-sup@factory.test',
            'internal_role' => 'supervisor',
            'is_active' => true,
        ]);
        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $supervisor2->id,
            'role' => 'supervisor',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $agent1 = User::factory()->create([
            'name' => 'Carol Agent',
            'email' => 'carol-agent@factory.test',
            'internal_role' => 'agent',
            'is_active' => true,
        ]);
        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $agent1->id,
            'role' => 'agent',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->withToken($owner->createToken('test')->plainTextToken)
            ->getJson('/api/v1/internal-users');

        $response->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonPath('data.0.role', 'agent')
            ->assertJsonPath('data.1.role', 'supervisor')
            ->assertJsonPath('data.2.role', 'supervisor');

        $this->assertArrayHasKey('id', $response['data'][0]);
        $this->assertArrayHasKey('name', $response['data'][0]);
        $this->assertArrayHasKey('email', $response['data'][0]);
        $this->assertArrayHasKey('role', $response['data'][0]);
    }

    public function test_authenticated_user_can_fetch_internal_users_with_public_company_id_query(): void
    {
        $company = Company::create([
            'company_id' => 'FAC-INT-FETCH-PUBLIC',
            'name' => 'Internal Fetch Public ID Test Co',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'User fetch testing',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $owner = User::factory()->create(['internal_role' => null]);
        $agent = User::factory()->create([
            'name' => 'Public ID Agent',
            'internal_role' => 'agent',
            'is_active' => true,
        ]);

        DB::table('company_users')->insert([
            [
                'company_id' => $company->id,
                'user_id' => $owner->id,
                'role' => 'owner',
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

        $response = $this->withToken($owner->createToken('test')->plainTextToken)
            ->getJson('/api/v1/internal-users?company_id='.strtolower($company->company_id));

        $response->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $agent->id)
            ->assertJsonPath('data.0.role', 'agent')
            ->assertJsonPath('data.0.onboarding_status', $agent->onboarding_status)
            ->assertJsonPath('data.0.is_active', true);
    }

    public function test_manager_can_fetch_onboarding_status_summary_including_pending_users(): void
    {
        $company = Company::create([
            'company_id' => 'FAC-INT-SUMMARY',
            'name' => 'Onboarding Status Summary Co',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Onboarding status dashboard',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $owner = User::factory()->create(['internal_role' => null]);
        $activeSupervisor = User::factory()->create([
            'internal_role' => 'supervisor',
            'onboarding_status' => 'active',
            'is_active' => true,
            'internal_onboarding_completed_at' => now(),
        ]);
        $pendingAgent = User::factory()->create([
            'internal_role' => 'agent',
            'onboarding_status' => 'pending_onboarding',
            'is_active' => false,
            'internal_onboarding_completed_at' => null,
        ]);

        DB::table('company_users')->insert([
            [
                'company_id' => $company->id,
                'user_id' => $owner->id,
                'role' => 'owner',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'company_id' => $company->id,
                'user_id' => $activeSupervisor->id,
                'role' => 'supervisor',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'company_id' => $company->id,
                'user_id' => $pendingAgent->id,
                'role' => 'agent',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        $response = $this->withToken($owner->createToken('test')->plainTextToken)
            ->getJson('/api/v1/internal-users/onboarding-status?company_id='.$company->company_id);

        $response->assertOk()
            ->assertJsonPath('data.summary.total', 2)
            ->assertJsonPath('data.summary.active', 1)
            ->assertJsonPath('data.summary.pending_onboarding', 1)
            ->assertJsonPath('data.summary.inactive', 1)
            ->assertJsonCount(2, 'data.items');
    }

    public function test_agent_cannot_fetch_internal_users(): void
    {
        $company = Company::create([
            'company_id' => 'FAC-INT-NOAGENT',
            'name' => 'No Agent Access Company',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Access control checks',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $agent = User::factory()->create([
            'internal_role' => 'agent',
            'is_active' => true,
        ]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'role' => 'agent',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->withToken($agent->createToken('test')->plainTextToken)
            ->getJson('/api/v1/internal-users?company_id='.$company->company_id);

        $response->assertUnprocessable()
            ->assertJsonPath('errors.authorization.0', 'You are not allowed to manage supervisors or agents.');
    }

    public function test_fetch_can_include_pending_onboarding_users_when_requested(): void
    {
        $company = Company::create([
            'company_id' => 'FAC-INT-PENDING',
            'name' => 'Pending Tracking Company',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Onboarding status tracking',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $owner = User::factory()->create(['internal_role' => null]);
        $activeSupervisor = User::factory()->create([
            'internal_role' => 'supervisor',
            'onboarding_status' => 'active',
            'is_active' => true,
            'internal_onboarding_completed_at' => now(),
        ]);
        $pendingAgent = User::factory()->create([
            'internal_role' => 'agent',
            'onboarding_status' => 'pending_onboarding',
            'is_active' => false,
            'internal_onboarding_completed_at' => null,
        ]);

        DB::table('company_users')->insert([
            [
                'company_id' => $company->id,
                'user_id' => $owner->id,
                'role' => 'owner',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'company_id' => $company->id,
                'user_id' => $activeSupervisor->id,
                'role' => 'supervisor',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'company_id' => $company->id,
                'user_id' => $pendingAgent->id,
                'role' => 'agent',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        $response = $this->withToken($owner->createToken('test')->plainTextToken)
            ->getJson('/api/v1/internal-users?include_inactive=1');

        $response->assertOk()
            ->assertJsonCount(2, 'data');

        $this->assertContains($activeSupervisor->id, collect($response['data'])->pluck('id')->toArray());
        $this->assertContains($pendingAgent->id, collect($response['data'])->pluck('id')->toArray());

        $pendingPayload = collect($response['data'])->firstWhere('id', $pendingAgent->id);

        $this->assertSame('pending_onboarding', $pendingPayload['onboarding_status']);
        $this->assertFalse((bool) $pendingPayload['is_active']);
    }

    public function test_fetch_can_filter_by_onboarding_status(): void
    {
        $company = Company::create([
            'company_id' => 'FAC-INT-STATUS',
            'name' => 'Status Filter Company',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Onboarding status tracking',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $owner = User::factory()->create(['internal_role' => null]);
        $activeSupervisor = User::factory()->create([
            'internal_role' => 'supervisor',
            'onboarding_status' => 'active',
            'is_active' => true,
            'internal_onboarding_completed_at' => now(),
        ]);
        $pendingAgent = User::factory()->create([
            'internal_role' => 'agent',
            'onboarding_status' => 'pending_onboarding',
            'is_active' => false,
        ]);

        DB::table('company_users')->insert([
            [
                'company_id' => $company->id,
                'user_id' => $owner->id,
                'role' => 'owner',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'company_id' => $company->id,
                'user_id' => $activeSupervisor->id,
                'role' => 'supervisor',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'company_id' => $company->id,
                'user_id' => $pendingAgent->id,
                'role' => 'agent',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        $response = $this->withToken($owner->createToken('test')->plainTextToken)
            ->getJson('/api/v1/internal-users?onboarding_status=pending_onboarding');

        $response->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $pendingAgent->id)
            ->assertJsonPath('data.0.onboarding_status', 'pending_onboarding')
            ->assertJsonPath('data.0.is_active', false);
    }

    public function test_fetch_filters_by_role(): void
    {
        $company = Company::create([
            'company_id' => 'FAC-INT-ROLE',
            'name' => 'Role Filter Test Co',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Role filtering test',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $owner = User::factory()->create(['internal_role' => null]);
        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $owner->id,
            'role' => 'owner',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $supervisor = User::factory()->create([
            'name' => 'Supervisor',
            'internal_role' => 'supervisor',
            'is_active' => true,
        ]);
        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $supervisor->id,
            'role' => 'supervisor',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $agent1 = User::factory()->create([
            'name' => 'Agent 1',
            'internal_role' => 'agent',
            'is_active' => true,
        ]);
        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $agent1->id,
            'role' => 'agent',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $agent2 = User::factory()->create([
            'name' => 'Agent 2',
            'internal_role' => 'agent',
            'is_active' => true,
        ]);
        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $agent2->id,
            'role' => 'agent',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->withToken($owner->createToken('test')->plainTextToken)
            ->getJson('/api/v1/internal-users?role=supervisor');

        $response->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.role', 'supervisor');

        $agentResponse = $this->withToken($owner->createToken('test')->plainTextToken)
            ->getJson('/api/v1/internal-users?role=agent');

        $agentResponse->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.role', 'agent')
            ->assertJsonPath('data.1.role', 'agent');
    }

    public function test_fetch_excludes_inactive_users(): void
    {
        $company = Company::create([
            'company_id' => 'FAC-INT-INACTIVE',
            'name' => 'Inactive Filter Test Co',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Inactive filtering',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $owner = User::factory()->create(['internal_role' => null]);
        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $owner->id,
            'role' => 'owner',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $activeSupervisor = User::factory()->create([
            'name' => 'Active Supervisor',
            'internal_role' => 'supervisor',
            'is_active' => true,
        ]);
        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $activeSupervisor->id,
            'role' => 'supervisor',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $inactiveSupervisor = User::factory()->create([
            'name' => 'Inactive Supervisor',
            'internal_role' => 'supervisor',
            'is_active' => false,
        ]);
        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $inactiveSupervisor->id,
            'role' => 'supervisor',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->withToken($owner->createToken('test')->plainTextToken)
            ->getJson('/api/v1/internal-users');

        $response->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $activeSupervisor->id);
    }

    public function test_fetch_respects_company_isolation(): void
    {
        $company1 = Company::create([
            'company_id' => 'FAC-INT-ISO1',
            'name' => 'Company 1',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Isolation test 1',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $company2 = Company::create([
            'company_id' => 'FAC-INT-ISO2',
            'name' => 'Company 2',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Isolation test 2',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $owner1 = User::factory()->create(['internal_role' => null]);
        DB::table('company_users')->insert([
            'company_id' => $company1->id,
            'user_id' => $owner1->id,
            'role' => 'owner',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $supervisor1 = User::factory()->create([
            'name' => 'Company 1 Supervisor',
            'internal_role' => 'supervisor',
            'is_active' => true,
        ]);
        DB::table('company_users')->insert([
            'company_id' => $company1->id,
            'user_id' => $supervisor1->id,
            'role' => 'supervisor',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $supervisor2 = User::factory()->create([
            'name' => 'Company 2 Supervisor',
            'internal_role' => 'supervisor',
            'is_active' => true,
        ]);
        DB::table('company_users')->insert([
            'company_id' => $company2->id,
            'user_id' => $supervisor2->id,
            'role' => 'supervisor',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->withToken($owner1->createToken('test')->plainTextToken)
            ->getJson('/api/v1/internal-users');

        $response->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $supervisor1->id)
            ->assertJsonPath('data.0.name', 'Company 1 Supervisor');

        $this->assertNotContains(
            $supervisor2->id,
            collect($response['data'])->pluck('id')->toArray()
        );
    }

    public function test_fetch_returns_empty_list_when_no_users(): void
    {
        $company = Company::create([
            'company_id' => 'FAC-INT-EMPTY',
            'name' => 'Empty Company',
            'country' => 'NG',
            'team_size' => '2-10',
            'use_case' => 'Empty test',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $owner = User::factory()->create(['internal_role' => null]);
        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $owner->id,
            'role' => 'owner',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->withToken($owner->createToken('test')->plainTextToken)
            ->getJson('/api/v1/internal-users');

        $response->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_unauthenticated_user_cannot_fetch(): void
    {
        $response = $this->getJson('/api/v1/internal-users');

        $response->assertUnauthorized();
    }

    public function test_user_without_company_context_cannot_fetch(): void
    {
        $orphanUser = User::factory()->create(['internal_role' => null]);

        $response = $this->withToken($orphanUser->createToken('test')->plainTextToken)
            ->getJson('/api/v1/internal-users');

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['company_id']);
    }

    public function test_invalid_role_filter_is_rejected(): void
    {
        $company = Company::create([
            'company_id' => 'FAC-INT-INVALID',
            'name' => 'Invalid Role Test',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Invalid role filter',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $owner = User::factory()->create(['internal_role' => null]);
        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $owner->id,
            'role' => 'owner',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->withToken($owner->createToken('test')->plainTextToken)
            ->getJson('/api/v1/internal-users?role=invalid');

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['role']);
    }

    public function test_invalid_onboarding_status_filter_is_rejected(): void
    {
        $company = Company::create([
            'company_id' => 'FAC-INT-INVALID-STATUS',
            'name' => 'Invalid Status Filter Test',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Invalid onboarding status filter',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $owner = User::factory()->create(['internal_role' => null]);
        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $owner->id,
            'role' => 'owner',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->withToken($owner->createToken('test')->plainTextToken)
            ->getJson('/api/v1/internal-users?onboarding_status=unknown');

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['onboarding_status']);
    }

    public function test_fetch_with_unrelated_company_id_returns_selected_company_error(): void
    {
        $company = Company::create([
            'company_id' => 'FAC-INT-MAIN',
            'name' => 'Main Company',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Selected company validation',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $otherCompany = Company::create([
            'company_id' => 'FAC-INT-OTHER',
            'name' => 'Other Company',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Selected company validation',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $owner = User::factory()->create(['internal_role' => null]);
        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $owner->id,
            'role' => 'owner',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->withToken($owner->createToken('test')->plainTextToken)
            ->getJson('/api/v1/internal-users?company_id='.$otherCompany->id);

        $response->assertUnprocessable()
            ->assertJsonPath('errors.company_id.0', 'You are not attached to the selected company context.');
    }
}
