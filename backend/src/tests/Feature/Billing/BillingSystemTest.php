<?php

declare(strict_types=1);

namespace Tests\Feature\Billing;

use App\Enums\SubscriptionStatus;
use App\Models\Company;
use App\Models\User;
use App\Services\Billing\BillingEnforcementSettingService;
use App\Services\Billing\CompanySeatLimitService;
use App\Services\Billing\PaymentLinkService;
use App\Services\Billing\SubscriptionLifecycleService;
use App\Models\PlatformSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\Support\ActivatesCompanySubscription;
use Tests\TestCase;

class BillingSystemTest extends TestCase
{
    use ActivatesCompanySubscription;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withBillingEnforcement();
    }

    public function test_workspace_onboarding_sets_pending_payment_status(): void
    {
        $user = User::factory()->create([
            'email_verified_at' => now(),
            'onboarding_completed_at' => null,
        ]);

        $token = $this->ownerToken($user);

        $response = $this->withToken($token)->postJson('/api/v1/onboarding/workspace', [
            'company_name' => 'Billing Test Co',
            'country' => 'NG',
            'team_size' => '2-10',
            'purpose' => 'startup',
            'user_type' => 'founder',
        ]);

        $response->assertCreated();

        $this->assertDatabaseHas('companies', [
            'name' => 'Billing Test Co',
            'subscription_status' => SubscriptionStatus::PENDING_PAYMENT->value,
        ]);
    }

    public function test_dashboard_route_is_blocked_without_active_subscription(): void
    {
        ['user' => $user] = $this->createCompanyWithOwner();

        $response = $this->withToken($this->ownerToken($user))
            ->getJson('/api/v1/dashboard/overview');

        $response->assertStatus(402)
            ->assertJsonPath('code', 'subscription_required')
            ->assertJsonPath('data.company_name', 'Test Company');
    }

    public function test_billing_status_endpoint_is_available_without_subscription(): void
    {
        ['user' => $user] = $this->createCompanyWithOwner();

        $response = $this->withToken($this->ownerToken($user))
            ->getJson('/api/v1/billing/status');

        $response->assertOk()
            ->assertJsonPath('data.subscription_status', SubscriptionStatus::PENDING_PAYMENT->value)
            ->assertJsonPath('data.has_active_subscription', false);
    }

    public function test_active_subscription_allows_dashboard_access(): void
    {
        ['user' => $user, 'company' => $company] = $this->createCompanyWithOwner();
        $this->activateCompanySubscription($company);

        $response = $this->withToken($this->ownerToken($user))
            ->getJson('/api/v1/user/me');

        $response->assertOk()
            ->assertJsonPath('data.billing.has_active_subscription', true)
            ->assertJsonPath('data.billing.has_paid_subscription', true);

        $dashboard = $this->withToken($this->ownerToken($user))
            ->getJson('/api/v1/dashboard/overview');
        $dashboard->assertStatus(200);
    }

    public function test_grace_status_allows_dashboard_access_even_when_enforcement_is_enabled(): void
    {
        ['user' => $user] = $this->createCompanyWithOwner([
            'subscription_status' => SubscriptionStatus::GRACE->value,
            'subscription_grace_ends_at' => now()->addDays(3),
        ]);

        $me = $this->withToken($this->ownerToken($user))
            ->getJson('/api/v1/user/me');

        $me->assertOk()
            ->assertJsonPath('data.billing.subscription_status', SubscriptionStatus::GRACE->value)
            ->assertJsonPath('data.billing.has_active_subscription', true)
            ->assertJsonPath('data.billing.has_paid_subscription', false)
            ->assertJsonPath('data.billing.billing_enforced', true);

        $dashboard = $this->withToken($this->ownerToken($user))
            ->getJson('/api/v1/dashboard/overview');

        $dashboard->assertOk();
    }

    public function test_past_due_status_is_blocked_when_enforcement_is_enabled(): void
    {
        ['user' => $user] = $this->createCompanyWithOwner([
            'subscription_status' => SubscriptionStatus::PAST_DUE->value,
        ]);

        $response = $this->withToken($this->ownerToken($user))
            ->getJson('/api/v1/dashboard/overview');

        $response->assertStatus(402)
            ->assertJsonPath('code', 'subscription_past_due');
    }

    public function test_suspended_status_is_blocked_when_enforcement_is_enabled(): void
    {
        ['user' => $user] = $this->createCompanyWithOwner([
            'subscription_status' => SubscriptionStatus::SUSPENDED->value,
        ]);

        $response = $this->withToken($this->ownerToken($user))
            ->getJson('/api/v1/dashboard/overview');

        $response->assertStatus(402)
            ->assertJsonPath('code', 'subscription_suspended');
    }

    public function test_pending_payment_is_blocked_when_enforcement_is_enabled(): void
    {
        ['user' => $user] = $this->createCompanyWithOwner();

        $response = $this->withToken($this->ownerToken($user))
            ->getJson('/api/v1/dashboard/overview');

        $response->assertStatus(402)
            ->assertJsonPath('code', 'subscription_required');
    }

    public function test_dashboard_access_allowed_when_enforcement_is_disabled_regardless_of_status(): void
    {
        PlatformSetting::setValue(BillingEnforcementSettingService::KEY, 'false');

        ['user' => $user] = $this->createCompanyWithOwner([
            'subscription_status' => SubscriptionStatus::PENDING_PAYMENT->value,
        ]);

        $response = $this->withToken($this->ownerToken($user))
            ->getJson('/api/v1/user/me');

        $response->assertOk()
            ->assertJsonPath('data.billing.has_active_subscription', true)
            ->assertJsonPath('data.billing.has_paid_subscription', false)
            ->assertJsonPath('data.billing.billing_enforced', false);

        $dashboard = $this->withToken($this->ownerToken($user))
            ->getJson('/api/v1/dashboard/overview');
        $dashboard->assertStatus(200);
    }

    public function test_billing_status_reports_can_manage_billing_for_owner(): void
    {
        ['user' => $owner] = $this->createCompanyWithOwner();

        $response = $this->withToken($this->ownerToken($owner))
            ->getJson('/api/v1/billing/status');

        $response->assertOk()
            ->assertJsonPath('data.can_manage_billing', true)
            ->assertJsonPath('data.viewer_role', 'owner');
    }

    public function test_billing_status_reports_cannot_manage_billing_for_agent(): void
    {
        ['company' => $company] = $this->createCompanyWithOwner();

        $agent = User::factory()->create([
            'onboarding_completed_at' => now(),
        ]);
        $company->users()->attach($agent->id, [
            'role' => 'agent',
            'joined_at' => now(),
        ]);

        $response = $this->withToken($this->ownerToken($agent))
            ->getJson('/api/v1/billing/status');

        $response->assertOk()
            ->assertJsonPath('data.can_manage_billing', false)
            ->assertJsonPath('data.viewer_role', 'agent');
    }

    public function test_agent_cannot_access_payment_method_setup(): void
    {
        ['company' => $company] = $this->createCompanyWithOwner();

        $agent = User::factory()->create([
            'onboarding_completed_at' => now(),
        ]);
        $company->users()->attach($agent->id, [
            'role' => 'agent',
            'joined_at' => now(),
        ]);

        $this->withToken($this->ownerToken($agent))
            ->postJson('/api/v1/billing/payment-methods/setup', [
                'company_id' => $company->id,
            ])
            ->assertStatus(422);
    }

    public function test_owner_can_list_payment_methods_without_stripe_customer(): void
    {
        ['user' => $owner, 'company' => $company] = $this->createCompanyWithOwner();

        $this->withToken($this->ownerToken($owner))
            ->getJson('/api/v1/billing/payment-methods?company_id=' . $company->id)
            ->assertOk()
            ->assertJsonPath('data.items', [])
            ->assertJsonPath('data.default_payment_method_id', null);
    }

    public function test_billing_portal_returns_specific_message_when_no_stripe_customer(): void
    {
        ['user' => $owner, 'company' => $company] = $this->createCompanyWithOwner();

        $this->withToken($this->ownerToken($owner))
            ->postJson('/api/v1/billing/portal', [
                'company_id' => $company->id,
            ])
            ->assertStatus(422)
            ->assertJsonPath('message', 'No billing profile exists for this company yet.')
            ->assertJsonPath('errors.billing.0', 'No billing profile exists for this company yet.');
    }

    public function test_seat_limit_blocks_internal_user_creation_at_cap(): void
    {
        ['user' => $owner, 'company' => $company] = $this->createCompanyWithOwner();
        $this->activateCompanySubscription($company, 'up_to_5');

        for ($i = 0; $i < 4; $i++) {
            $company->users()->attach(User::factory()->create([
                'internal_role' => 'agent',
            ])->id, [
                'role' => 'agent',
                'joined_at' => now(),
            ]);
        }

        $service = app(CompanySeatLimitService::class);
        $this->expectException(\Illuminate\Validation\ValidationException::class);
        $service->assertCanAddMember($company->fresh());
    }

    public function test_offline_payment_activation_sets_period_dates_and_enforces_seats(): void
    {
        ['company' => $company] = $this->createCompanyWithOwner();

        app(\App\Services\Billing\CompanySubscriptionService::class)->activateOfflinePayment(
            company: $company,
            planKey: 'up_to_5',
            interval: \App\Enums\BillingInterval::MONTHLY,
            periodStart: now()->startOfDay()->setDate(2026, 3, 1),
        );

        $company->refresh();

        $this->assertSame(SubscriptionStatus::ACTIVE->value, $company->subscription_status);
        $this->assertSame('up_to_5', $company->subscription_plan_key);
        $this->assertSame('2026-03-01', $company->subscription_current_period_start?->format('Y-m-d'));
        $this->assertSame('2026-04-01', $company->subscription_current_period_end?->format('Y-m-d'));

        for ($i = 0; $i < 4; $i++) {
            $company->users()->attach(User::factory()->create([
                'internal_role' => 'agent',
            ])->id, [
                'role' => 'agent',
                'joined_at' => now(),
            ]);
        }

        $this->expectException(\Illuminate\Validation\ValidationException::class);
        app(CompanySeatLimitService::class)->assertCanAddMember($company->fresh());
    }

    public function test_payment_link_generation_and_resolution(): void
    {
        ['company' => $company] = $this->createCompanyWithOwner();
        $service = app(PaymentLinkService::class);

        $result = $service->generate(
            company: $company,
            planKey: 'up_to_10',
            interval: \App\Enums\BillingInterval::MONTHLY,
        );

        $this->assertNotEmpty($result['url']);
        $payload = $service->publicPayload($result['token']);
        $this->assertSame('Test Company', $payload['company_name']);
        $this->assertSame('up_to_10', $payload['plan_key']);
    }

    public function test_lifecycle_command_moves_expired_subscription_to_grace_and_then_suspended(): void
    {
        Notification::fake();

        ['company' => $company] = $this->createCompanyWithOwner([
            'subscription_status' => SubscriptionStatus::ACTIVE->value,
            'subscription_plan_key' => 'up_to_5',
            'subscription_current_period_end' => now()->subDay(),
        ]);

        app(SubscriptionLifecycleService::class)->process();

        $company->refresh();
        $this->assertSame(SubscriptionStatus::GRACE->value, $company->subscription_status);
        $this->assertNotNull($company->subscription_grace_ends_at);

        $company->forceFill([
            'subscription_grace_ends_at' => now()->subDay(),
        ])->save();

        app(SubscriptionLifecycleService::class)->process();

        $this->assertSame(SubscriptionStatus::SUSPENDED->value, $company->fresh()->subscription_status);
    }

    public function test_assigned_plan_locks_billing_plans_catalog(): void
    {
        ['user' => $user, 'company' => $company] = $this->createCompanyWithOwner([
            'assigned_plan_key' => 'up_to_10',
        ]);

        $response = $this->withToken($this->ownerToken($user))
            ->getJson('/api/v1/billing/plans');

        $response->assertOk();
        $plans = $response->json('data.plans');
        $this->assertCount(1, $plans);
        $this->assertSame('up_to_10', $plans[0]['key']);
        $this->assertFalse($response->json('data.billing_status.can_choose_plan'));
    }

    public function test_checkout_returns_validation_error_when_stripe_is_not_configured(): void
    {
        ['user' => $user] = $this->createCompanyWithOwner();

        config()->set('cashier.key', '');
        config()->set('cashier.secret', '');

        $response = $this->withToken($this->ownerToken($user))
            ->postJson('/api/v1/billing/checkout', [
                'plan_key' => 'up_to_5',
                'interval' => 'monthly',
                'context' => 'onboarding',
            ]);

        $response->assertStatus(422)
            ->assertJsonPath('errors.billing.0', 'Billing is temporarily unavailable. Please contact support to complete your subscription.');
    }

    public function test_payment_link_checkout_returns_validation_error_when_stripe_is_not_configured(): void
    {
        ['company' => $company] = $this->createCompanyWithOwner();

        config()->set('cashier.key', '');
        config()->set('cashier.secret', '');

        $token = app(PaymentLinkService::class)->generate(
            company: $company,
            planKey: 'up_to_10',
            interval: \App\Enums\BillingInterval::MONTHLY,
        )['token'];

        $response = $this->postJson('/api/v1/billing/payment-link/' . $token . '/checkout');

        $response->assertStatus(422)
            ->assertJsonPath('errors.billing.0', 'Billing is temporarily unavailable. Please contact support to complete your subscription.');
    }

    public function test_soft_deleted_users_do_not_consume_seats(): void
    {
        ['company' => $company] = $this->createCompanyWithOwner();
        $this->activateCompanySubscription($company, 'up_to_5');

        $member = User::factory()->create(['internal_role' => 'agent']);
        $company->users()->attach($member->id, [
            'role' => 'agent',
            'joined_at' => now(),
        ]);

        $service = app(CompanySeatLimitService::class);
        $this->assertSame(2, $service->countMembers($company->fresh()));

        $member->delete();

        $this->assertSame(1, $service->countMembers($company->fresh()));
    }

    public function test_missing_plan_key_on_active_company_blocks_adds(): void
    {
        ['company' => $company] = $this->createCompanyWithOwner([
            'subscription_status' => SubscriptionStatus::ACTIVE->value,
            'subscription_plan_key' => null,
        ]);

        $this->expectException(\Illuminate\Validation\ValidationException::class);
        $this->expectExceptionMessage('Subscription plan is not configured');

        app(CompanySeatLimitService::class)->assertCanAddMember($company->fresh());
    }

    public function test_cannot_switch_to_plan_below_current_seat_usage(): void
    {
        ['company' => $company] = $this->createCompanyWithOwner();
        $this->activateCompanySubscription($company, 'up_to_10');

        for ($i = 0; $i < 6; $i++) {
            $company->users()->attach(User::factory()->create([
                'internal_role' => 'agent',
            ])->id, [
                'role' => 'agent',
                'joined_at' => now(),
            ]);
        }

        $this->expectException(\Illuminate\Validation\ValidationException::class);
        $this->expectExceptionMessage('Remove');

        app(CompanySeatLimitService::class)->assertCanSwitchToPlan($company->fresh(), 'up_to_5');
    }

    public function test_change_plan_requires_active_stripe_subscription(): void
    {
        ['user' => $user, 'company' => $company] = $this->createCompanyWithOwner();
        $this->activateCompanySubscription($company, 'up_to_5');

        config()->set('cashier.key', 'pk_test_x');
        config()->set('cashier.secret', 'sk_test_x');

        $response = $this->withToken($this->ownerToken($user))
            ->postJson('/api/v1/billing/change-plan', [
                'plan_key' => 'up_to_10',
                'interval' => 'monthly',
            ]);

        $response->assertStatus(422)
            ->assertJsonPath(
                'errors.plan_key.0',
                'No active Stripe subscription found. Use checkout to start or convert your plan.',
            );
    }

    public function test_checkout_upgrade_rejected_when_active_stripe_subscription_exists(): void
    {
        ['user' => $user, 'company' => $company] = $this->createCompanyWithOwner([
            'stripe_id' => 'cus_test_seats',
        ]);
        $this->activateCompanySubscription($company, 'up_to_5');

        \Illuminate\Support\Facades\DB::table('subscriptions')->insert([
            'company_id' => $company->id,
            'type' => 'default',
            'stripe_id' => 'sub_test_seats_' . $company->id,
            'stripe_status' => 'active',
            'stripe_price' => 'price_test',
            'quantity' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->withToken($this->ownerToken($user))
            ->postJson('/api/v1/billing/checkout', [
                'plan_key' => 'up_to_10',
                'interval' => 'monthly',
                'context' => 'upgrade',
            ]);

        $response->assertStatus(422)
            ->assertJsonPath(
                'errors.plan_key.0',
                'You already have an active Stripe subscription. Use Change plan to switch plans.',
            );
    }

    public function test_locked_assigned_plan_rejects_other_plans_on_change_plan(): void
    {
        ['user' => $user, 'company' => $company] = $this->createCompanyWithOwner([
            'assigned_plan_key' => 'up_to_5',
            'assigned_billing_interval' => 'monthly',
            'stripe_id' => 'cus_locked',
        ]);
        $this->activateCompanySubscription($company, 'up_to_5');

        \Illuminate\Support\Facades\DB::table('subscriptions')->insert([
            'company_id' => $company->id,
            'type' => 'default',
            'stripe_id' => 'sub_locked_' . $company->id,
            'stripe_status' => 'active',
            'stripe_price' => 'price_test',
            'quantity' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        config()->set('cashier.key', 'pk_test_x');
        config()->set('cashier.secret', 'sk_test_x');

        $response = $this->withToken($this->ownerToken($user))
            ->postJson('/api/v1/billing/change-plan', [
                'plan_key' => 'up_to_10',
                'interval' => 'monthly',
            ]);

        $response->assertStatus(422)
            ->assertJsonPath(
                'errors.plan_key.0',
                'Your account is assigned to a specific plan. Please select the assigned plan.',
            );
    }

    public function test_checkout_upgrade_context_allowed_for_offline_paid_without_stripe_sub(): void
    {
        ['user' => $user, 'company' => $company] = $this->createCompanyWithOwner([
            'subscription_status' => SubscriptionStatus::ACTIVE->value,
            'subscription_plan_key' => 'up_to_5',
            'subscription_billing_interval' => 'monthly',
            'subscription_current_period_start' => now(),
            'subscription_current_period_end' => now()->addMonth(),
            // Unlocked offline-paid (no assigned_plan_key) can self-serve upgrade via checkout.
            'assigned_plan_key' => null,
            'assigned_billing_interval' => null,
        ]);

        config()->set('cashier.key', '');
        config()->set('cashier.secret', '');

        $response = $this->withToken($this->ownerToken($user))
            ->postJson('/api/v1/billing/checkout', [
                'plan_key' => 'up_to_10',
                'interval' => 'monthly',
                'context' => 'upgrade',
            ]);

        // Offline paid has no Cashier sub, so upgrade checkout is allowed until Stripe config fails.
        $response->assertStatus(422)
            ->assertJsonPath('errors.billing.0', 'Billing is temporarily unavailable. Please contact support to complete your subscription.');
    }

    public function test_admin_can_update_offline_plan_for_company(): void
    {
        $this->withoutMiddleware(\Illuminate\Foundation\Http\Middleware\PreventRequestForgery::class);

        ['company' => $company] = $this->createCompanyWithOwner();
        $this->activateCompanySubscription($company, 'up_to_5');

        $admin = \App\Models\Admin::create([
            'name' => 'Billing Admin',
            'email' => 'billing-admin@example.com',
            'password' => 'StrongPass123!',
            'role' => 'super_admin',
            'is_active' => true,
        ]);

        $this->actingAs($admin, 'admin')
            ->post(route('admin.billing.companies.offline-plan.update', $company), [
                'plan_key' => 'up_to_10',
                'interval' => 'annual',
                'payment_start_date' => '2026-06-01',
            ])
            ->assertRedirect();

        $company->refresh();
        $this->assertSame('up_to_10', $company->subscription_plan_key);
        $this->assertSame('annual', $company->subscription_billing_interval);
        $this->assertSame('2026-06-01', $company->subscription_current_period_start?->format('Y-m-d'));
        $this->assertSame('2027-06-01', $company->subscription_current_period_end?->format('Y-m-d'));
        $this->assertSame(10, app(CompanySeatLimitService::class)->seatLimit($company));
    }
}
