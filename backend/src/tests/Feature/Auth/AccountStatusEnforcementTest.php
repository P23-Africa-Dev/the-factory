<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\Company;
use App\Models\User;
use App\Support\UserAccountStatus;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AccountStatusEnforcementTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create([
            'company_id' => 'FAC-STATUS-ENF',
            'name' => 'Status Enforcement Co',
            'country' => 'NG',
            'currency_code' => 'NGN',
            'team_size' => '11-50',
            'use_case' => 'Access control',
            'status' => 'active',
            'activated_at' => now(),
        ]);
    }

    public function test_suspended_user_with_existing_token_is_blocked_on_authenticated_request(): void
    {
        $user = $this->makeOwner(['suspended_until' => now()->addDays(3)]);
        $token = $user->createToken('test-token', ['*'])->plainTextToken;

        $response = $this->withToken($token)->getJson('/api/v1/user/me');

        $response->assertForbidden()
            ->assertJsonPath('code', UserAccountStatus::SUSPENDED_TEMPORARY)
            ->assertJsonPath('success', false);

        $this->assertDatabaseMissing('personal_access_tokens', [
            'tokenable_id' => $user->id,
        ]);
    }

    public function test_deactivated_user_with_existing_token_is_blocked_on_authenticated_request(): void
    {
        $user = $this->makeOwner(['is_active' => false, 'deactivated_at' => now()]);
        $token = $user->createToken('test-token', ['*'])->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/v1/user/me')
            ->assertForbidden()
            ->assertJsonPath('code', UserAccountStatus::DEACTIVATED);

        $this->assertDatabaseMissing('personal_access_tokens', [
            'tokenable_id' => $user->id,
        ]);
    }

    public function test_suspended_user_login_returns_specific_message(): void
    {
        $user = $this->makeOwner(['suspended_until' => now()->addDays(5)]);

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => $user->email,
            'password' => 'password123',
        ]);

        $response->assertForbidden()
            ->assertJsonPath('code', UserAccountStatus::SUSPENDED_TEMPORARY)
            ->assertJsonFragment([
                'message' => UserAccountStatus::temporarySuspensionMessage($user->fresh()->suspended_until),
            ]);
    }

    public function test_deactivated_user_login_returns_specific_message(): void
    {
        $user = $this->makeOwner([
            'is_active' => false,
            'deactivated_at' => now(),
        ]);

        $this->postJson('/api/v1/auth/login', [
            'email' => $user->email,
            'password' => 'password123',
        ])
            ->assertForbidden()
            ->assertJsonPath('code', UserAccountStatus::DEACTIVATED)
            ->assertJsonFragment([
                'message' => UserAccountStatus::deactivatedMessage(),
            ]);
    }

    public function test_permanently_suspended_user_login_returns_permanent_message(): void
    {
        $user = $this->makeOwner(['suspended_until' => Carbon::create(2099, 12, 31, 23, 59, 59)]);

        $this->postJson('/api/v1/auth/login', [
            'email' => $user->email,
            'password' => 'password123',
        ])
            ->assertForbidden()
            ->assertJsonPath('code', UserAccountStatus::SUSPENDED_PERMANENT)
            ->assertJsonFragment([
                'message' => UserAccountStatus::permanentSuspensionMessage(),
            ]);
    }

    public function test_expired_suspension_is_lifted_on_authenticated_request(): void
    {
        $user = $this->makeOwner(['suspended_until' => now()->subHour()]);
        $token = $user->createToken('test-token', ['*'])->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/v1/user/me')
            ->assertOk();

        $this->assertNull($user->fresh()->suspended_until);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function makeOwner(array $overrides = []): User
    {
        $user = User::factory()->create(array_merge([
            'password' => bcrypt('password123'),
            'is_active' => true,
            'internal_role' => null,
            'onboarding_completed_at' => now(),
        ], $overrides));

        DB::table('company_users')->insert([
            'company_id' => $this->company->id,
            'user_id' => $user->id,
            'role' => 'owner',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $user;
    }
}
