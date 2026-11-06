<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\Company;
use App\Models\User;
use App\Support\MobileAgentSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class MobileLoginTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private User $agent;
    private User $supervisor;
    private User $internalAdmin;
    private User $selfServe;
    private User $enterprise;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create([
            'company_id' => 'FAC-MOBILE-TEST',
            'name' => 'Mobile Test Co',
            'country' => 'NG',
            'currency_code' => 'NGN',
            'team_size' => '11-50',
            'use_case' => 'Mobile unified auth',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $this->agent = User::factory()->create([
            'email' => 'agent@mobiletest.com',
            'password' => bcrypt('password123'),
            'is_active' => true,
            'internal_role' => 'agent',
            'onboarding_status' => 'active',
            'internal_onboarding_completed_at' => now(),
        ]);

        $this->supervisor = User::factory()->create([
            'email' => 'supervisor@mobiletest.com',
            'password' => bcrypt('password123'),
            'is_active' => true,
            'internal_role' => 'supervisor',
            'onboarding_status' => 'active',
            'internal_onboarding_completed_at' => now(),
        ]);

        $this->internalAdmin = User::factory()->create([
            'email' => 'admin@mobiletest.com',
            'password' => bcrypt('password123'),
            'is_active' => true,
            'internal_role' => 'admin',
            'onboarding_status' => 'active',
            'internal_onboarding_completed_at' => now(),
        ]);

        $this->selfServe = User::factory()->create([
            'email' => 'selfserve@mobiletest.com',
            'password' => bcrypt('password123'),
            'is_active' => true,
            'internal_role' => null,
            'onboarding_completed_at' => now(),
        ]);

        $this->enterprise = User::factory()->create([
            'email' => 'enterprise@mobiletest.com',
            'password' => bcrypt('password123'),
            'is_active' => true,
            'internal_role' => null,
            'enterprise_onboarding_completed_at' => now(),
        ]);

        DB::table('company_users')->insert([
            [
                'company_id' => $this->company->id,
                'user_id' => $this->agent->id,
                'role' => 'agent',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'company_id' => $this->company->id,
                'user_id' => $this->supervisor->id,
                'role' => 'supervisor',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'company_id' => $this->company->id,
                'user_id' => $this->internalAdmin->id,
                'role' => 'admin',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'company_id' => $this->company->id,
                'user_id' => $this->selfServe->id,
                'role' => 'owner',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'company_id' => $this->company->id,
                'user_id' => $this->enterprise->id,
                'role' => 'owner',
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);
    }

    public function test_agent_logs_in_with_agent_mode_and_home_path(): void
    {
        $response = $this->postJson('/api/v1/mobile/login', [
            'email' => 'agent@mobiletest.com',
            'password' => 'password123',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.app_mode', 'agent')
            ->assertJsonPath('data.home_path', '/')
            ->assertJsonPath('data.access_role', 'agent')
            ->assertJsonPath('data.internal_role', 'agent');

        $this->assertNotEmpty($response->json('data.token'));
    }

    public function test_supervisor_logs_in_with_manager_mode_and_manager_home_path(): void
    {
        $response = $this->postJson('/api/v1/mobile/login', [
            'email' => 'supervisor@mobiletest.com',
            'password' => 'password123',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.app_mode', 'manager')
            ->assertJsonPath('data.home_path', '/manager')
            ->assertJsonPath('data.access_role', 'supervisor')
            ->assertJsonPath('data.internal_role', 'supervisor');

        $this->assertNotEmpty($response->json('data.token'));
    }

    public function test_admin_logs_in_with_manager_mode(): void
    {
        $response = $this->postJson('/api/v1/mobile/login', [
            'email' => 'admin@mobiletest.com',
            'password' => 'password123',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.app_mode', 'manager')
            ->assertJsonPath('data.home_path', '/manager')
            ->assertJsonPath('data.access_role', 'admin')
            ->assertJsonPath('data.internal_role', 'admin');
    }

    public function test_self_serve_owner_logs_in_with_manager_mode(): void
    {
        $response = $this->postJson('/api/v1/mobile/login', [
            'email' => 'selfserve@mobiletest.com',
            'password' => 'password123',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.app_mode', 'manager')
            ->assertJsonPath('data.home_path', '/manager')
            ->assertJsonPath('data.user_type', 'self-serve');
    }

    public function test_enterprise_owner_logs_in_with_manager_mode(): void
    {
        $response = $this->postJson('/api/v1/mobile/login', [
            'email' => 'enterprise@mobiletest.com',
            'password' => 'password123',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.app_mode', 'manager')
            ->assertJsonPath('data.home_path', '/manager')
            ->assertJsonPath('data.user_type', 'enterprise');
    }

    public function test_wrong_password_returns_401(): void
    {
        $response = $this->postJson('/api/v1/mobile/login', [
            'email' => 'agent@mobiletest.com',
            'password' => 'incorrectpassword',
        ]);

        $response->assertStatus(401)
            ->assertJsonPath('status', 'error');
    }

    public function test_mobile_session_revalidation_returns_mode(): void
    {
        $token = $this->agent->createToken('agent_auth_token', ['*'])->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/v1/mobile/session');

        $response->assertOk()
            ->assertJsonPath('data.app_mode', 'agent')
            ->assertJsonPath('data.home_path', '/');
    }

    public function test_legacy_mobile_agent_token_detected_for_clean_relogin(): void
    {
        $token = $this->supervisor->createToken('agent_auth_token', [MobileAgentSession::ABILITY])->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/v1/mobile/session');

        $response->assertOk()
            ->assertJsonPath('data.app_mode', 'legacy_mobile_agent')
            ->assertJsonPath('data.home_path', '/login');
    }
}

