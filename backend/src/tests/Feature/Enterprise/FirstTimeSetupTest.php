<?php

declare(strict_types=1);

namespace Tests\Feature\Enterprise;

use App\Models\Company;
use App\Models\CompanyDemoRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FirstTimeSetupTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_verify_company_id_and_complete_setup(): void
    {
        $company = Company::create([
            'company_id' => 'FAC-ABCD1234',
            'name' => 'Analytical Engines Ltd',
            'country' => 'GB',
            'team_size' => '11-50',
            'use_case' => 'Enterprise workflows',
            'status' => 'active',
        ]);

        $user = User::factory()->create([
            'name' => 'Ada Lovelace',
            'email' => 'ada@analytical.co',
            'is_active' => false,
            'enterprise_onboarding_completed_at' => null,
        ]);

        $plainToken = str_repeat('a', 64);

        $demoRequest = CompanyDemoRequest::create([
            'full_name' => 'Ada Lovelace',
            'email' => 'ada@analytical.co',
            'company_name' => 'Analytical Engines Ltd',
            'country' => 'GB',
            'team_size' => '11-50',
            'use_case' => 'Enterprise workflows',
            'status' => 'approved',
            'company_id' => $company->id,
            'user_id' => $user->id,
            'activation_token_hash' => hash('sha256', $plainToken),
            'activation_link_expires_at' => now()->addHour(),
            'approved_at' => now(),
            'requested_at' => now(),
        ]);

        $verifyResponse = $this->postJson('/api/v1/enterprise/onboarding/verify-company-id', [
            'request_id' => $demoRequest->id,
            'token' => $plainToken,
            'company_id' => 'FAC-ABCD1234',
        ]);

        $verifyResponse->assertOk()
            ->assertJson([
                'success' => true,
                'data' => [
                    'email' => 'ada@analytical.co',
                    'company_id' => 'FAC-ABCD1234',
                ],
            ]);

        $completeResponse = $this->postJson('/api/v1/enterprise/onboarding/complete', [
            'request_id' => $demoRequest->id,
            'token' => $plainToken,
            'company_id' => 'FAC-ABCD1234',
            'password' => 'SecurePass123!',
            'password_confirmation' => 'SecurePass123!',
        ]);

        $completeResponse->assertOk()
            ->assertJson(['success' => true])
            ->assertJsonStructure(['data' => ['token', 'token_type', 'user']]);

        $demoRequest->refresh();
        $user->refresh();

        $this->assertSame('activated', $demoRequest->status);
        $this->assertNotNull($demoRequest->activated_at);
        $this->assertNull($demoRequest->activation_token_hash);
        $this->assertTrue($user->is_active);
        $this->assertNotNull($user->enterprise_onboarding_completed_at);

        $this->assertDatabaseHas('company_users', [
            'company_id' => $company->id,
            'user_id' => $user->id,
            'role' => 'owner',
        ]);
    }

    public function test_setup_info_returns_prefill_data_for_valid_token(): void
    {
        $company = Company::create([
            'company_id' => 'FAC-XYZ12345',
            'name' => 'Factory Co',
            'country' => 'NG',
            'team_size' => '2-10',
            'use_case' => 'Ops automation',
            'status' => 'active',
        ]);

        $plainToken = str_repeat('b', 64);

        $demoRequest = CompanyDemoRequest::create([
            'full_name' => 'John Doe',
            'email' => 'john@factory.co',
            'company_name' => 'Factory Co',
            'country' => 'NG',
            'team_size' => '2-10',
            'use_case' => 'Ops automation',
            'status' => 'approved',
            'company_id' => $company->id,
            'activation_token_hash' => hash('sha256', $plainToken),
            'activation_link_expires_at' => now()->addHour(),
            'requested_at' => now(),
            'approved_at' => now(),
        ]);

        $this->getJson('/api/v1/enterprise/onboarding/setup-info?request_id='.$demoRequest->id.'&token='.$plainToken)
            ->assertOk()
            ->assertJson([
                'success' => true,
                'data' => [
                    'request_id' => $demoRequest->id,
                    'email' => 'john@factory.co',
                    'company_id' => 'FAC-XYZ12345',
                    'company_name' => 'Factory Co',
                ],
            ]);
    }

    public function test_setup_info_rejects_invalid_token(): void
    {
        $company = Company::create([
            'company_id' => 'FAC-BAD12345',
            'name' => 'Invalid Token Co',
            'country' => 'NG',
            'team_size' => '2-10',
            'use_case' => 'Ops automation',
            'status' => 'active',
        ]);

        $demoRequest = CompanyDemoRequest::create([
            'full_name' => 'John Doe',
            'email' => 'john@bad-token.co',
            'company_name' => 'Invalid Token Co',
            'country' => 'NG',
            'team_size' => '2-10',
            'use_case' => 'Ops automation',
            'status' => 'approved',
            'company_id' => $company->id,
            'activation_token_hash' => hash('sha256', str_repeat('d', 64)),
            'activation_link_expires_at' => now()->addHour(),
            'requested_at' => now(),
            'approved_at' => now(),
        ]);

        $wrongToken = str_repeat('e', 64);

        $this->getJson('/api/v1/enterprise/onboarding/setup-info?request_id='.$demoRequest->id.'&token='.$wrongToken)
            ->assertUnprocessable();
    }

    public function test_setup_info_rejects_expired_token(): void
    {
        $company = Company::create([
            'company_id' => 'FAC-EXP12345',
            'name' => 'Expired Co',
            'country' => 'GB',
            'team_size' => '2-10',
            'use_case' => 'Workflow automation',
            'status' => 'active',
        ]);

        $plainToken = str_repeat('f', 64);

        $demoRequest = CompanyDemoRequest::create([
            'full_name' => 'Jane Doe',
            'email' => 'jane@expired.co',
            'company_name' => 'Expired Co',
            'country' => 'GB',
            'team_size' => '2-10',
            'use_case' => 'Workflow automation',
            'status' => 'approved',
            'company_id' => $company->id,
            'activation_token_hash' => hash('sha256', $plainToken),
            'activation_link_expires_at' => now()->subMinute(),
            'requested_at' => now()->subDays(10),
            'approved_at' => now()->subDays(10),
        ]);

        $this->getJson('/api/v1/enterprise/onboarding/setup-info?request_id='.$demoRequest->id.'&token='.$plainToken)
            ->assertUnprocessable();
    }

    public function test_first_time_setup_link_cannot_be_reused_after_successful_completion(): void
    {
        $company = Company::create([
            'company_id' => 'FAC-ONCE1234',
            'name' => 'Reusable Check Ltd',
            'country' => 'GB',
            'team_size' => '11-50',
            'use_case' => 'Enterprise workflows',
            'status' => 'active',
        ]);

        $user = User::factory()->create([
            'name' => 'Reuse Guard',
            'email' => 'reuse@guard.test',
            'is_active' => true,
            'enterprise_onboarding_completed_at' => null,
        ]);

        $plainToken = str_repeat('c', 64);

        $demoRequest = CompanyDemoRequest::create([
            'full_name' => 'Reuse Guard',
            'email' => 'reuse@guard.test',
            'company_name' => 'Reusable Check Ltd',
            'country' => 'GB',
            'team_size' => '11-50',
            'use_case' => 'Enterprise workflows',
            'status' => 'approved',
            'company_id' => $company->id,
            'user_id' => $user->id,
            'activation_token_hash' => hash('sha256', $plainToken),
            'activation_link_expires_at' => now()->addHour(),
            'approved_at' => now(),
            'requested_at' => now(),
        ]);

        $this->postJson('/api/v1/enterprise/onboarding/complete', [
            'request_id' => $demoRequest->id,
            'token' => $plainToken,
            'company_id' => 'FAC-ONCE1234',
            'password' => 'SecurePass123!',
            'password_confirmation' => 'SecurePass123!',
        ])->assertOk();

        $this->postJson('/api/v1/enterprise/onboarding/complete', [
            'request_id' => $demoRequest->id,
            'token' => $plainToken,
            'company_id' => 'FAC-ONCE1234',
            'password' => 'AnotherPass123!',
            'password_confirmation' => 'AnotherPass123!',
        ])->assertUnprocessable();
    }

}
