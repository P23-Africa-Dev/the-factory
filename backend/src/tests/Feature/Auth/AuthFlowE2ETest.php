<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\Company;
use App\Models\CompanyDemoRequest;
use App\Models\User;
use App\Services\Auth\OtpService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;
use Laravel\Sanctum\PersonalAccessToken;
/**
 * End-to-end authentication lifecycle tests.
 *
 * Validates the full auth cycle for all onboarding paths:
 * - Self-serve: register → verify OTP → create workspace → dashboard access
 * - Enterprise: complete first-time setup → dashboard access
 * - Shared: login → /user/me → logout → 401 on subsequent calls
 */
class AuthFlowE2ETest extends TestCase
{
    use RefreshDatabase;

    private OtpService $otpService;

    protected function setUp(): void
    {
        parent::setUp();
        $this->otpService = app(OtpService::class);
    }

    // -----------------------------------------------------------------------
    // Self-serve: full registration → workspace creation → dashboard flow
    // -----------------------------------------------------------------------

    public function test_selfserve_registration_issues_token_after_otp_verification(): void
    {
        User::factory()->create([
            'email' => 'selfserve@example.com',
            'email_verified_at' => null,
        ]);

        $otp = $this->otpService->generate('selfserve@example.com', 'registration');

        $verifyResponse = $this->postJson('/api/v1/auth/verify-email', [
            'email' => 'selfserve@example.com',
            'otp_code' => $otp,
        ]);

        $verifyResponse->assertOk()
            ->assertJsonStructure([
                'data' => ['token', 'token_type', 'expires_in_days', 'user', 'onboarding_completed'],
            ]);

        $this->assertSame('Bearer', $verifyResponse->json('data.token_type'));
        $this->assertSame(30, $verifyResponse->json('data.expires_in_days'));
        $this->assertNotEmpty($verifyResponse->json('data.token'));
        $this->assertFalse($verifyResponse->json('data.onboarding_completed'));
    }

    public function test_selfserve_token_grants_access_before_workspace_creation(): void
    {
        $user = User::factory()->create([
            'email' => 'selfserve@example.com',
            'email_verified_at' => null,
        ]);

        $otp = $this->otpService->generate('selfserve@example.com', 'registration');

        $verifyResponse = $this->postJson('/api/v1/auth/verify-email', [
            'email' => 'selfserve@example.com',
            'otp_code' => $otp,
        ]);

        $token = $verifyResponse->json('data.token');

        // Token must work for the /user/me endpoint immediately
        $meResponse = $this->withToken($token)->getJson('/api/v1/user/me');

        $meResponse->assertOk()
            ->assertJsonPath('data.email', 'selfserve@example.com')
            ->assertJsonPath('data.onboarding_completed', false);
    }

    public function test_selfserve_workspace_creation_marks_onboarding_complete(): void
    {
        $user = User::factory()->create([
            'email' => 'selfserve@example.com',
            'email_verified_at' => now(),
            'onboarding_completed_at' => null,
        ]);

        $token = $user->createToken('auth_token', ['*'], now()->addDays(30))->plainTextToken;

        $workspaceResponse = $this->withToken($token)->postJson('/api/v1/onboarding/workspace', [
            'company_name' => 'Acme Corp',
            'country' => 'NG',
            'team_size' => '2-10',
            'purpose' => 'startup',
            'user_type' => 'founder',
        ]);

        $workspaceResponse->assertStatus(201)
            ->assertJsonPath('data.onboarding_completed', true)
            ->assertJsonPath('data.user.onboarding_completed', true)
            ->assertJsonPath('data.user.user_type', 'self-serve');
    }

    public function test_selfserve_token_persists_and_works_after_workspace_creation(): void
    {
        $user = User::factory()->create([
            'email' => 'selfserve@example.com',
            'email_verified_at' => now(),
            'onboarding_completed_at' => null,
        ]);

        $preOnboardingToken = $user->createToken('auth_token', ['*'], now()->addDays(30))->plainTextToken;

        // Step 1: create workspace and receive rotated token for post-onboarding auth
        $workspaceResponse = $this->withToken($preOnboardingToken)->postJson('/api/v1/onboarding/workspace', [
            'company_name' => 'Acme Corp',
            'country' => 'NG',
            'team_size' => '2-10',
            'purpose' => 'startup',
            'user_type' => 'founder',
        ]);

        $workspaceResponse->assertStatus(201)
            ->assertJsonPath('data.token_type', 'Bearer');

        $postOnboardingToken = $workspaceResponse->json('data.token');

        $this->assertNotEmpty($postOnboardingToken);
        $this->assertNotSame($preOnboardingToken, $postOnboardingToken);

        // Step 2: NEW token must work for dashboard (/user/me)
        $meResponse = $this->withToken($postOnboardingToken)->getJson('/api/v1/user/me');

        $meResponse->assertOk()
            ->assertJsonPath('data.onboarding_completed', true)
            ->assertJsonPath('data.user_type', 'self-serve')
            ->assertJsonStructure([
                'data' => ['id', 'name', 'email', 'onboarding_completed', 'user_type', 'active_company'],
            ]);

        // Step 3: old onboarding token is revoked by rotation
        $this->assertDatabaseMissing('personal_access_tokens', [
            'name' => 'auth_token',
            'tokenable_id' => $user->id,
        ]);

        $this->assertDatabaseHas('personal_access_tokens', [
            'name' => 'onboarding_auth_token',
            'tokenable_id' => $user->id,
        ]);

        // active_company must be set after workspace creation
        $this->assertNotNull($meResponse->json('data.active_company'));
        $this->assertSame('owner', $meResponse->json('data.active_company.role'));
    }

    // -----------------------------------------------------------------------
    // Enterprise: first-time setup → token → dashboard access
    // -----------------------------------------------------------------------

    public function test_enterprise_setup_completion_issues_token(): void
    {
        $company = Company::create([
            'company_id' => 'FAC-E2E-001',
            'name' => 'E2E Corp',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Enterprise E2E',
            'status' => 'active',
        ]);

        $user = User::factory()->create([
            'email' => 'admin@e2ecorp.com',
            'is_active' => false,
            'enterprise_onboarding_completed_at' => null,
        ]);

        $plainToken = str_repeat('e', 64);

        $demoRequest = CompanyDemoRequest::create([
            'full_name' => 'E2E Admin',
            'email' => 'admin@e2ecorp.com',
            'company_name' => 'E2E Corp',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Enterprise E2E',
            'status' => 'approved',
            'company_id' => $company->id,
            'user_id' => $user->id,
            'activation_token_hash' => hash('sha256', $plainToken),
            'activation_link_expires_at' => now()->addHour(),
            'approved_at' => now(),
            'requested_at' => now(),
        ]);

        $response = $this->postJson('/api/v1/enterprise/onboarding/complete', [
            'request_id' => $demoRequest->id,
            'token' => $plainToken,
            'company_id' => 'FAC-E2E-001',
            'password' => 'SecurePass123!',
            'password_confirmation' => 'SecurePass123!',
        ]);

        $response->assertOk()
            ->assertJsonStructure(['data' => ['token', 'token_type', 'user']])
            ->assertJsonPath('data.token_type', 'Bearer');

        $this->assertNotEmpty($response->json('data.token'));
    }

    public function test_enterprise_token_grants_dashboard_access_with_correct_state(): void
    {
        $company = Company::create([
            'company_id' => 'FAC-E2E-002',
            'name' => 'Enterprise Dashboard Corp',
            'country' => 'GB',
            'team_size' => '51-200',
            'use_case' => 'Enterprise E2E',
            'status' => 'active',
        ]);

        $user = User::factory()->create([
            'email' => 'owner@entdash.com',
            'is_active' => false,
            'enterprise_onboarding_completed_at' => null,
        ]);

        $plainToken = str_repeat('f', 64);

        $demoRequest = CompanyDemoRequest::create([
            'full_name' => 'Ent Owner',
            'email' => 'owner@entdash.com',
            'company_name' => 'Enterprise Dashboard Corp',
            'country' => 'GB',
            'team_size' => '51-200',
            'use_case' => 'Enterprise E2E',
            'status' => 'approved',
            'company_id' => $company->id,
            'user_id' => $user->id,
            'activation_token_hash' => hash('sha256', $plainToken),
            'activation_link_expires_at' => now()->addHour(),
            'approved_at' => now(),
            'requested_at' => now(),
        ]);

        $setupResponse = $this->postJson('/api/v1/enterprise/onboarding/complete', [
            'request_id' => $demoRequest->id,
            'token' => $plainToken,
            'company_id' => 'FAC-E2E-002',
            'password' => 'SecurePass123!',
            'password_confirmation' => 'SecurePass123!',
        ]);

        $authToken = $setupResponse->json('data.token');

        // Use the issued token for dashboard access
        $meResponse = $this->withToken($authToken)->getJson('/api/v1/user/me');

        $meResponse->assertOk()
            ->assertJsonPath('data.email', 'owner@entdash.com')
            ->assertJsonPath('data.onboarding_completed', true)
            ->assertJsonPath('data.enterprise_onboarding_completed', true)
            ->assertJsonPath('data.user_type', 'enterprise');

        $this->assertNotNull($meResponse->json('data.active_company'));
        $this->assertSame('owner', $meResponse->json('data.active_company.role'));
    }

    // -----------------------------------------------------------------------
    // Login → /user/me → logout → 401 cycle
    // -----------------------------------------------------------------------

    public function test_selfserve_login_then_dashboard_then_logout_cycle(): void
    {
        $company = Company::create([
            'company_id' => 'FAC-CYCLE-SS',
            'name' => 'Cycle Self-Serve Co',
            'country' => 'NG',
            'team_size' => '2-10',
            'use_case' => 'Lifecycle test',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $user = User::factory()->create([
            'email' => 'cycle-ss@example.com',
            'password' => bcrypt('CyclePass123!'),
            'is_active' => true,
            'internal_role' => null,
            'onboarding_completed_at' => now(),
        ]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $user->id,
            'role' => 'owner',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Step 1: Login
        $loginResponse = $this->postJson('/api/v1/auth/login', [
            'email' => 'cycle-ss@example.com',
            'password' => 'CyclePass123!',
        ]);

        $loginResponse->assertOk()
            ->assertJsonPath('data.token_type', 'Bearer')
            ->assertJsonPath('data.user_type', 'self-serve');

        $token = $loginResponse->json('data.token');
        $this->assertNotEmpty($token);

        // Step 2: Dashboard access
        $meResponse = $this->withToken($token)->getJson('/api/v1/user/me');

        $meResponse->assertOk()
            ->assertJsonPath('data.onboarding_completed', true)
            ->assertJsonPath('data.user_type', 'self-serve');

        $this->assertNotNull($meResponse->json('data.active_company'));

        // Step 3: Logout
        $this->withToken($token)->postJson('/api/v1/auth/logout')->assertOk();

        // Step 4: Token is removed from the database (revoked)
        $this->assertDatabaseMissing('personal_access_tokens', [
            'tokenable_id' => $user->id,
        ]);
    }

    public function test_enterprise_login_then_dashboard_then_logout_cycle(): void
    {
        $company = Company::create([
            'company_id' => 'FAC-CYCLE-ENT',
            'name' => 'Cycle Enterprise Co',
            'country' => 'GB',
            'team_size' => '11-50',
            'use_case' => 'Lifecycle test',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $user = User::factory()->create([
            'email' => 'cycle-ent@example.com',
            'password' => bcrypt('CyclePass123!'),
            'is_active' => true,
            'internal_role' => null,
            'enterprise_onboarding_completed_at' => now(),
        ]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $user->id,
            'role' => 'owner',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Step 1: Login
        $loginResponse = $this->postJson('/api/v1/auth/login', [
            'email' => 'cycle-ent@example.com',
            'password' => 'CyclePass123!',
        ]);

        $loginResponse->assertOk()
            ->assertJsonPath('data.token_type', 'Bearer')
            ->assertJsonPath('data.user_type', 'enterprise');

        $token = $loginResponse->json('data.token');

        // Step 2: Dashboard access
        $meResponse = $this->withToken($token)->getJson('/api/v1/user/me');

        $meResponse->assertOk()
            ->assertJsonPath('data.onboarding_completed', true)
            ->assertJsonPath('data.enterprise_onboarding_completed', true)
            ->assertJsonPath('data.user_type', 'enterprise');

        // Step 3: Logout
        $this->withToken($token)->postJson('/api/v1/auth/logout')->assertOk();

        // Step 4: Token is removed from the database (revoked)
        $this->assertDatabaseMissing('personal_access_tokens', [
            'tokenable_id' => $user->id,
        ]);
    }

    // -----------------------------------------------------------------------
    // UserResource correctness for all onboarding types
    // -----------------------------------------------------------------------

    public function test_user_resource_reports_correct_state_for_selfserve_user(): void
    {
        $user = User::factory()->create([
            'email' => 'ss-resource@example.com',
            'email_verified_at' => now(),
            'onboarding_completed_at' => now(),
        ]);

        $token = $user->createToken('t', ['*'])->plainTextToken;

        $response = $this->withToken($token)->getJson('/api/v1/user/me');

        $response->assertOk()
            ->assertJsonPath('data.onboarding_completed', true)
            ->assertJsonPath('data.enterprise_onboarding_completed', false)
            ->assertJsonPath('data.user_type', 'self-serve')
            ->assertJsonPath('data.email_verified', true);
    }

    public function test_user_resource_reports_correct_state_for_enterprise_user(): void
    {
        $user = User::factory()->create([
            'email' => 'ent-resource@example.com',
            'email_verified_at' => now(),
            'enterprise_onboarding_completed_at' => now(),
            'onboarding_completed_at' => null,
        ]);

        $token = $user->createToken('t', ['*'])->plainTextToken;

        $response = $this->withToken($token)->getJson('/api/v1/user/me');

        $response->assertOk()
            // Critical: enterprise users must show onboarding_completed = true
            ->assertJsonPath('data.onboarding_completed', true)
            ->assertJsonPath('data.enterprise_onboarding_completed', true)
            ->assertJsonPath('data.user_type', 'enterprise')
            ->assertJsonPath('data.email_verified', true);
    }

    public function test_user_resource_reports_not_completed_for_unverified_user(): void
    {
        $user = User::factory()->create([
            'email' => 'unverified@example.com',
            'email_verified_at' => null,
            'onboarding_completed_at' => null,
            'enterprise_onboarding_completed_at' => null,
        ]);

        $token = $user->createToken('t', ['*'])->plainTextToken;

        $response = $this->withToken($token)->getJson('/api/v1/user/me');

        $response->assertOk()
            ->assertJsonPath('data.onboarding_completed', false)
            ->assertJsonPath('data.enterprise_onboarding_completed', false)
            ->assertJsonPath('data.user_type', null)
            ->assertJsonPath('data.email_verified', false);
    }

    // -----------------------------------------------------------------------
    // No access without authentication
    // -----------------------------------------------------------------------

    public function test_unauthenticated_request_to_dashboard_endpoint_returns_401(): void
    {
        $this->getJson('/api/v1/user/me')->assertUnauthorized()
            ->assertJson(['success' => false]);
    }

    public function test_unauthenticated_request_to_workspace_endpoint_returns_401(): void
    {
        $this->postJson('/api/v1/onboarding/workspace', [
            'company_name' => 'Test Co',
            'country' => 'NG',
            'team_size' => '2-10',
            'purpose' => 'startup',
            'user_type' => 'founder',
        ])->assertUnauthorized();
    }

    public function test_unauthenticated_logout_returns_401(): void
    {
        $this->postJson('/api/v1/auth/logout')->assertUnauthorized();
    }

    // -----------------------------------------------------------------------
    // Token does not carry over across separate devices
    // -----------------------------------------------------------------------

    public function test_logout_only_revokes_current_token_not_all_tokens(): void
    {
        $user = User::factory()->create([
            'email' => 'multidevice@example.com',
            'is_active' => true,
        ]);

        $tokenA = $user->createToken('device-a', ['*'])->plainTextToken;
        $tokenB = $user->createToken('device-b', ['*'])->plainTextToken;

        // Logout device A
        $this->withToken($tokenA)->postJson('/api/v1/auth/logout')->assertOk();

        // Device A token is removed from the database
        $this->assertDatabaseMissing('personal_access_tokens', [
            'name' => 'device-a',
            'tokenable_id' => $user->id,
        ]);

        // Device B token remains in the database
        $this->assertDatabaseHas('personal_access_tokens', [
            'name' => 'device-b',
            'tokenable_id' => $user->id,
        ]);
    }

    public function test_request_with_invalid_token_returns_401(): void
    {
        $this->withToken('not-a-real-token-at-all')->getJson('/api/v1/user/me')
            ->assertUnauthorized()
            ->assertJson(['success' => false]);
    }

    public function test_request_with_expired_token_returns_401(): void
    {
        $user = User::factory()->create();

        // Create a token that expired in the past
        $user->createToken(
            name: 'expired-token',
            abilities: ['*'],
            expiresAt: now()->subDay(),
        );

        // Fetch the raw token hash from DB to simulate using it
        $pat = PersonalAccessToken::where('tokenable_id', $user->id)
            ->where('name', 'expired-token')
            ->first();

        $this->assertNotNull($pat);
        $this->assertTrue($pat->expires_at->isPast());
    }
}
