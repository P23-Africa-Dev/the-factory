<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Admin;
use App\Models\Company;
use App\Models\SupportAccessSession;
use App\Models\User;
use App\Services\Admin\SupportAccessService;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class SupportAccessTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(PreventRequestForgery::class);
        Mail::fake();
    }

    public function test_only_super_admin_can_create_support_access(): void
    {
        [$admin, $target, $company] = $this->fixtures('admin');

        $this->actingAs($admin, 'admin')
            ->post(route('admin.users.support-access.store', $target), [
                'company_id' => $company->id,
                'access_level' => 'read_only',
                'reason' => 'Investigating customer dashboard issue.',
                'admin_password' => 'StrongPass123!',
            ])
            ->assertForbidden();
    }

    public function test_super_admin_must_confirm_password(): void
    {
        [$admin, $target, $company] = $this->fixtures();

        $this->actingAs($admin, 'admin')
            ->from(route('admin.users.show', $target))
            ->post(route('admin.users.support-access.store', $target), [
                'company_id' => $company->id,
                'access_level' => 'read_only',
                'reason' => 'Investigating customer dashboard issue.',
                'admin_password' => 'WrongPassword123!',
            ])
            ->assertSessionHasErrors('admin_password');

        $this->assertDatabaseCount('support_access_sessions', 0);
        $this->assertDatabaseHas('admin_action_logs', [
            'admin_id' => $admin->id,
            'action' => 'support_access.step_up_failed',
        ]);
    }

    public function test_exchange_is_single_use_and_creates_short_lived_support_token(): void
    {
        [$admin, $target, $company] = $this->fixtures();
        $created = $this->createGrant($admin, $target, $company, 'read_only');

        $response = $this->postJson('/api/v1/support-access/exchange', [
            'code' => $created['exchange_code'],
        ])->assertOk()
            ->assertJsonPath('data.support_session.access_level', 'read_only')
            ->assertJsonPath('data.support_session.company.id', $company->id);

        $token = (string) $response->json('data.token');
        $session = SupportAccessSession::query()->firstOrFail();

        $this->assertNotSame('', $token);
        $this->assertNull($session->exchange_code_hash);
        $this->assertNotNull($session->personal_access_token_id);
        $this->assertTrue($session->session_expires_at?->isFuture() ?? false);
        $this->assertTrue($session->session_expires_at?->lessThanOrEqualTo(now()->addMinutes(16)) ?? false);

        $this->postJson('/api/v1/support-access/exchange', [
            'code' => $created['exchange_code'],
        ])->assertUnprocessable();
    }

    public function test_read_only_session_pins_company_and_blocks_mutations(): void
    {
        [$admin, $target, $company] = $this->fixtures();
        $token = $this->exchangeGrant($admin, $target, $company, 'read_only');

        $this->withToken($token)
            ->getJson('/api/v1/user/me')
            ->assertOk()
            ->assertJsonPath('data.active_company.id', $company->id);

        $this->withToken($token)
            ->postJson('/api/v1/tasks', [])
            ->assertForbidden()
            ->assertJsonPath('message', 'This support session is read-only.');

        $this->assertDatabaseHas('admin_action_logs', [
            'admin_id' => $admin->id,
            'action' => 'support_access.action_denied',
        ]);
    }

    public function test_operational_session_allows_normal_mutations_but_blocks_sensitive_actions(): void
    {
        [$admin, $target, $company] = $this->fixtures();
        $token = $this->exchangeGrant($admin, $target, $company, 'operational_full');

        $this->withToken($token)
            ->postJson('/api/v1/tasks', [])
            ->assertUnprocessable();

        $this->withToken($token)
            ->patchJson('/api/v1/company/settings', [
                'company_id' => $company->id,
                'meeting_defaults' => ['default_reminder_minutes' => 30],
            ])
            ->assertForbidden()
            ->assertJsonPath(
                'message',
                'This security-sensitive action is blocked during support access.'
            );
    }

    public function test_ending_support_session_revokes_only_support_token_and_audits_action(): void
    {
        [$admin, $target, $company] = $this->fixtures();
        $normalToken = $target->createToken('normal-session', ['*'], now()->addDay());
        $token = $this->exchangeGrant($admin, $target, $company, 'read_only');

        $this->withToken($token)
            ->postJson('/api/v1/support-access/end')
            ->assertOk();

        $session = SupportAccessSession::query()->firstOrFail();
        $this->assertNotNull($session->ended_at);
        $this->assertDatabaseMissing('personal_access_tokens', [
            'id' => $session->personal_access_token_id,
        ]);
        $this->assertDatabaseHas('personal_access_tokens', [
            'id' => $normalToken->accessToken->id,
        ]);
        $this->assertDatabaseHas('admin_action_logs', [
            'admin_id' => $admin->id,
            'action' => 'support_access.ended',
        ]);
    }

    public function test_inactive_or_non_onboarded_target_is_rejected(): void
    {
        [$admin, $target, $company] = $this->fixtures();
        $target->update([
            'is_active' => false,
            'onboarding_completed_at' => null,
        ]);

        $this->actingAs($admin, 'admin')
            ->from(route('admin.users.show', $target))
            ->post(route('admin.users.support-access.store', $target), [
                'company_id' => $company->id,
                'access_level' => 'read_only',
                'reason' => 'Investigating customer dashboard issue.',
                'admin_password' => 'StrongPass123!',
            ])
            ->assertSessionHasErrors('user');
    }

    public function test_expired_session_is_revoked_and_audited(): void
    {
        [$admin, $target, $company] = $this->fixtures();
        $token = $this->exchangeGrant($admin, $target, $company, 'read_only');
        $session = SupportAccessSession::query()->firstOrFail();
        $session->update(['session_expires_at' => now()->subSecond()]);

        $this->withToken($token)
            ->getJson('/api/v1/support-access/status')
            ->assertForbidden();

        $this->assertNotNull($session->fresh()->revoked_at);
        $this->assertDatabaseHas('admin_action_logs', [
            'admin_id' => $admin->id,
            'action' => 'support_access.expired',
        ]);
    }

    public function test_exchange_endpoint_is_rate_limited(): void
    {
        $this->withMiddleware(ThrottleRequests::class);

        for ($attempt = 0; $attempt < 10; $attempt++) {
            $this->postJson('/api/v1/support-access/exchange', [
                'code' => str_repeat((string) ($attempt % 10), 64),
            ])->assertUnprocessable();
        }

        $this->postJson('/api/v1/support-access/exchange', [
            'code' => str_repeat('a', 64),
        ])->assertTooManyRequests();
    }

    /**
     * @return array{0: Admin, 1: User, 2: Company}
     */
    private function fixtures(string $adminRole = 'super_admin'): array
    {
        $admin = Admin::create([
            'name' => 'Support Admin',
            'email' => 'support-admin@example.com',
            'password' => 'StrongPass123!',
            'role' => $adminRole,
            'is_active' => true,
        ]);

        $company = Company::create([
            'company_id' => 'FAC-SUPPORT-001',
            'name' => 'Support Test Company',
            'country' => 'NG',
            'currency_code' => 'NGN',
            'team_size' => '2-10',
            'use_case' => 'Support testing',
            'status' => 'active',
            'activated_at' => now(),
            'subscription_status' => 'active',
            'subscription_plan_key' => 'up_to_50',
            'subscription_billing_interval' => 'monthly',
            'subscription_current_period_start' => now(),
            'subscription_current_period_end' => now()->addMonth(),
        ]);

        $target = User::factory()->create([
            'email' => 'customer@example.com',
            'is_active' => true,
            'internal_role' => null,
            'onboarding_completed_at' => now(),
            'email_verified_at' => now(),
        ]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $target->id,
            'role' => 'owner',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return [$admin, $target, $company];
    }

    /**
     * @return array{session: SupportAccessSession, exchange_code: string}
     */
    private function createGrant(
        Admin $admin,
        User $target,
        Company $company,
        string $accessLevel,
    ): array {
        $request = Request::create('/admin/users/' . $target->id . '/support-access', 'POST');
        $request->server->set('REMOTE_ADDR', '127.0.0.1');

        return app(SupportAccessService::class)->create(
            admin: $admin,
            target: $target,
            data: [
                'company_id' => $company->id,
                'access_level' => $accessLevel,
                'reason' => 'Investigating customer dashboard issue.',
                'ticket_reference' => 'SUP-1001',
                'admin_password' => 'StrongPass123!',
            ],
            request: $request,
        );
    }

    private function exchangeGrant(
        Admin $admin,
        User $target,
        Company $company,
        string $accessLevel,
    ): string {
        $created = $this->createGrant($admin, $target, $company, $accessLevel);

        return (string) $this->postJson('/api/v1/support-access/exchange', [
            'code' => $created['exchange_code'],
        ])->assertOk()->json('data.token');
    }
}
