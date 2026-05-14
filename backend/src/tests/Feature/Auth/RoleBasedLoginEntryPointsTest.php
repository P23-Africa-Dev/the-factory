<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class RoleBasedLoginEntryPointsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $company = Company::create([
            'company_id' => 'FAC-ROLE-LOGIN',
            'name' => 'Role Login Co',
            'country' => 'NG',
            'currency_code' => 'NGN',
            'team_size' => '11-50',
            'use_case' => 'Access control',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $selfServe = User::factory()->create([
            'email' => 'selfserve@example.com',
            'password' => bcrypt('password123'),
            'is_active' => true,
            'internal_role' => null,
            'onboarding_completed_at' => now(),
        ]);

        $enterprise = User::factory()->create([
            'email' => 'enterprise@example.com',
            'password' => bcrypt('password123'),
            'is_active' => true,
            'internal_role' => null,
            'enterprise_onboarding_completed_at' => now(),
        ]);

        $supervisor = User::factory()->create([
            'email' => 'supervisor@example.com',
            'password' => bcrypt('password123'),
            'is_active' => true,
            'internal_role' => 'supervisor',
            'onboarding_status' => 'active',
            'internal_onboarding_completed_at' => now(),
        ]);

        $agent = User::factory()->create([
            'email' => 'agent@example.com',
            'password' => bcrypt('password123'),
            'is_active' => true,
            'internal_role' => 'agent',
            'onboarding_status' => 'active',
            'internal_onboarding_completed_at' => now(),
        ]);

        DB::table('company_users')->insert([
            [
                'company_id' => $company->id,
                'user_id' => $selfServe->id,
                'role' => 'owner',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'company_id' => $company->id,
                'user_id' => $enterprise->id,
                'role' => 'owner',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'company_id' => $company->id,
                'user_id' => $supervisor->id,
                'role' => 'supervisor',
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
    }

    public function test_admin_user_can_login_via_shared_auth_endpoint(): void
    {
        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'selfserve@example.com',
            'password' => 'password123',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.dashboard_path', '/dashboard')
            ->assertJsonPath('data.user_type', 'self-serve')
            ->assertJsonPath('data.access_role', 'admin');
    }

    public function test_supervisor_can_login_via_shared_auth_endpoint(): void
    {
        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'supervisor@example.com',
            'password' => 'password123',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.dashboard_path', '/dashboard')
            ->assertJsonPath('data.user_type', 'supervisor')
            ->assertJsonPath('data.access_role', 'supervisor')
            ->assertJsonPath('data.internal_role', 'supervisor');
    }

    public function test_shared_auth_rejects_user_without_active_company_membership(): void
    {
        User::factory()->create([
            'email' => 'orphan-owner@example.com',
            'password' => bcrypt('password123'),
            'is_active' => true,
            'internal_role' => null,
            'onboarding_completed_at' => now(),
        ]);

        $this->postJson('/api/v1/auth/login', [
            'email' => 'orphan-owner@example.com',
            'password' => 'password123',
        ])->assertUnauthorized();
    }

    public function test_agent_can_login_via_agent_endpoint(): void
    {
        $response = $this->postJson('/api/v1/agent/login', [
            'email' => 'agent@example.com',
            'password' => 'password123',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.dashboard_path', '/agent/dashboard')
            ->assertJsonPath('data.access_role', 'agent')
            ->assertJsonPath('data.internal_role', 'agent');
    }

    public function test_agent_cannot_login_via_shared_auth_endpoint(): void
    {
        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'agent@example.com',
            'password' => 'password123',
        ]);

        $response->assertUnauthorized();
    }

    public function test_supervisor_cannot_login_via_agent_endpoint(): void
    {
        $response = $this->postJson('/api/v1/agent/login', [
            'email' => 'supervisor@example.com',
            'password' => 'password123',
        ]);

        $response->assertUnauthorized();
    }

    public function test_self_serve_cannot_login_via_agent_endpoint(): void
    {
        $response = $this->postJson('/api/v1/agent/login', [
            'email' => 'selfserve@example.com',
            'password' => 'password123',
        ]);

        $response->assertUnauthorized();
    }

    public function test_internal_login_alias_keeps_backward_compatibility_for_agent(): void
    {
        $response = $this->postJson('/api/v1/internal/login', [
            'email' => 'agent@example.com',
            'password' => 'password123',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.dashboard_path', '/agent/dashboard')
            ->assertJsonPath('data.access_role', 'agent')
            ->assertJsonPath('data.internal_role', 'agent');
    }

    public function test_agent_cannot_access_management_admin_routes(): void
    {
        $agent = User::where('email', 'agent@example.com')->firstOrFail();

        $token = $agent->createToken('agent-token', ['*'])->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/v1/admin/tasks')
            ->assertForbidden();
    }

    public function test_management_user_can_access_management_admin_routes(): void
    {
        $supervisor = User::where('email', 'supervisor@example.com')->firstOrFail();

        $token = $supervisor->createToken('supervisor-token', ['*'])->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/v1/admin/tasks')
            ->assertOk();
    }

    public function test_management_user_cannot_access_agent_routes(): void
    {
        $supervisor = User::where('email', 'supervisor@example.com')->firstOrFail();

        $token = $supervisor->createToken('supervisor-token', ['*'])->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/v1/agent/tasks')
            ->assertForbidden();
    }

    public function test_agent_user_can_access_agent_routes(): void
    {
        $agent = User::where('email', 'agent@example.com')->firstOrFail();

        $token = $agent->createToken('agent-token', ['*'])->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/v1/agent/tasks')
            ->assertOk();
    }

    public function test_internal_login_alias_rejects_supervisor(): void
    {
        $response = $this->postJson('/api/v1/internal/login', [
            'email' => 'supervisor@example.com',
            'password' => 'password123',
        ]);

        $response->assertUnauthorized();
    }

    public function test_suspended_self_serve_user_cannot_login_via_shared_auth_endpoint(): void
    {
        $company = Company::create([
            'company_id' => 'FAC-SUSP-SELF',
            'name' => 'Suspended Selfserve Co',
            'country' => 'NG',
            'currency_code' => 'NGN',
            'team_size' => '2-10',
            'use_case' => 'Access tests',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $user = User::factory()->create([
            'email' => 'suspended-selfserve@example.com',
            'password' => bcrypt('password123'),
            'is_active' => true,
            'internal_role' => null,
            'onboarding_completed_at' => now(),
            'suspended_until' => now()->addDays(2),
        ]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $user->id,
            'role' => 'owner',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->postJson('/api/v1/auth/login', [
            'email' => 'suspended-selfserve@example.com',
            'password' => 'password123',
        ])->assertUnauthorized();
    }

    public function test_suspended_agent_cannot_login_via_agent_endpoint(): void
    {
        $company = Company::create([
            'company_id' => 'FAC-SUSP-AGENT',
            'name' => 'Suspended Agent Co',
            'country' => 'NG',
            'currency_code' => 'NGN',
            'team_size' => '2-10',
            'use_case' => 'Access tests',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $user = User::factory()->create([
            'email' => 'suspended-agent@example.com',
            'password' => bcrypt('password123'),
            'is_active' => true,
            'internal_role' => 'agent',
            'onboarding_status' => 'active',
            'internal_onboarding_completed_at' => now(),
            'suspended_until' => now()->addDays(2),
        ]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $user->id,
            'role' => 'agent',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->postJson('/api/v1/agent/login', [
            'email' => 'suspended-agent@example.com',
            'password' => 'password123',
        ])->assertUnauthorized();
    }

    public function test_suspended_agent_cannot_login_via_internal_alias_endpoint(): void
    {
        $company = Company::create([
            'company_id' => 'FAC-SUSP-INTAGENT',
            'name' => 'Suspended Internal Agent Co',
            'country' => 'NG',
            'currency_code' => 'NGN',
            'team_size' => '2-10',
            'use_case' => 'Access tests',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $user = User::factory()->create([
            'email' => 'suspended-internal-agent@example.com',
            'password' => bcrypt('password123'),
            'is_active' => true,
            'internal_role' => 'agent',
            'onboarding_status' => 'active',
            'internal_onboarding_completed_at' => now(),
            'suspended_until' => now()->addDays(2),
        ]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $user->id,
            'role' => 'agent',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->postJson('/api/v1/internal/login', [
            'email' => 'suspended-internal-agent@example.com',
            'password' => 'password123',
        ])->assertUnauthorized();
    }
}
