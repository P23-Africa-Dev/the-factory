<?php

declare(strict_types=1);

namespace Tests\Feature\Enterprise;

use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class EnterpriseLoginTest extends TestCase
{
    use RefreshDatabase;

    private function attachEnterpriseOwner(User $user, string $companyId, string $name = 'Enterprise Login Co'): void
    {
        $company = Company::create([
            'company_id' => $companyId,
            'name' => $name,
            'country' => 'NG',
            'currency_code' => 'NGN',
            'team_size' => '11-50',
            'use_case' => 'Enterprise operations',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $user->id,
            'role' => 'owner',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function test_enterprise_user_can_login_after_activation(): void
    {
        $user = User::factory()->create([
            'email' => 'ada@analytical.co',
            'password' => bcrypt('SecurePass123!'),
            'is_active' => true,
            'enterprise_onboarding_completed_at' => now(),
        ]);

        $this->attachEnterpriseOwner($user, 'FAC-ENT-LOGIN1', 'Analytical Co');

        $response = $this->postJson('/api/v1/enterprise/login', [
            'email' => 'ada@analytical.co',
            'password' => 'SecurePass123!',
        ]);

        $response->assertOk()
            ->assertJson(['success' => true])
            ->assertJsonStructure(['data' => ['token', 'token_type', 'user']]);
    }

    public function test_login_is_rejected_for_non_activated_user(): void
    {
        User::factory()->create([
            'email' => 'ada@analytical.co',
            'password' => bcrypt('SecurePass123!'),
            'is_active' => false,
            'enterprise_onboarding_completed_at' => null,
        ]);

        $response = $this->postJson('/api/v1/enterprise/login', [
            'email' => 'ada@analytical.co',
            'password' => 'SecurePass123!',
        ]);

        $response->assertStatus(401)
            ->assertJson(['success' => false]);
    }

    public function test_suspended_enterprise_user_cannot_login(): void
    {
        $user = User::factory()->create([
            'email' => 'suspended@analytical.co',
            'password' => bcrypt('SecurePass123!'),
            'is_active' => true,
            'enterprise_onboarding_completed_at' => now(),
            'suspended_until' => now()->addDays(5),
        ]);

        $this->attachEnterpriseOwner($user, 'FAC-ENT-LOGIN2', 'Suspended Enterprise Co');

        $response = $this->postJson('/api/v1/enterprise/login', [
            'email' => 'suspended@analytical.co',
            'password' => 'SecurePass123!',
        ]);

        $response->assertStatus(401)
            ->assertJson(['success' => false]);
    }

    public function test_enterprise_user_can_login_via_shared_auth_endpoint(): void
    {
        $user = User::factory()->create([
            'email' => 'shared@enterprise.co',
            'password' => bcrypt('SecurePass123!'),
            'is_active' => true,
            'enterprise_onboarding_completed_at' => now(),
            'internal_role' => null,
        ]);

        $this->attachEnterpriseOwner($user, 'FAC-ENT-LOGIN3', 'Shared Enterprise Co');

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'shared@enterprise.co',
            'password' => 'SecurePass123!',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.user_type', 'enterprise')
            ->assertJsonPath('data.access_role', 'admin');
    }
}
