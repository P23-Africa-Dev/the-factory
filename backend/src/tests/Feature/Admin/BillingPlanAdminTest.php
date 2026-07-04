<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Admin;
use App\Models\BillingPlan;
use App\Models\Company;
use App\Models\PlatformSetting;
use App\Services\Billing\BillingEnforcementSettingService;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\ActivatesCompanySubscription;
use Tests\TestCase;

class BillingPlanAdminTest extends TestCase
{
    use ActivatesCompanySubscription;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware(PreventRequestForgery::class);
        $this->withBillingEnforcement();
    }

    public function test_super_admin_can_access_billing_control_pages(): void
    {
        $admin = $this->makeAdmin('super_admin');

        $this->actingAs($admin, 'admin')
            ->get(route('admin.billing.index'))
            ->assertOk()
            ->assertSee('Subscription &amp; Enforcement Controls', false);

        $this->actingAs($admin, 'admin')
            ->get(route('admin.billing.plans.index'))
            ->assertOk();
    }

    public function test_non_super_admin_cannot_access_billing_control_pages(): void
    {
        $admin = $this->makeAdmin('admin');

        $this->actingAs($admin, 'admin')
            ->get(route('admin.billing.index'))
            ->assertForbidden();
    }

    public function test_super_admin_can_create_update_and_delete_billing_plan(): void
    {
        $admin = $this->makeAdmin('super_admin');

        $createPayload = [
            'plan_key' => 'up_to_250',
            'label' => 'Up to 250 users',
            'seat_limit' => 250,
            'monthly_amount' => 249900,
            'annual_amount' => 2499000,
            'monthly_price_id' => 'price_250month',
            'annual_price_id' => 'price_250year',
            'is_active' => '1',
            'sort_order' => 120,
        ];

        $this->actingAs($admin, 'admin')
            ->post(route('admin.billing.plans.store'), $createPayload)
            ->assertRedirect(route('admin.billing.plans.index'));

        $plan = BillingPlan::query()->where('plan_key', 'up_to_250')->first();
        $this->assertNotNull($plan);

        $this->actingAs($admin, 'admin')
            ->patch(route('admin.billing.plans.update', $plan), [
                'plan_key' => 'up_to_250',
                'label' => 'Up to 250 seats',
                'seat_limit' => 250,
                'monthly_amount' => 199900,
                'annual_amount' => 1999000,
                'monthly_price_id' => 'price_250monthv2',
                'annual_price_id' => 'price_250yearv2',
                'sort_order' => 140,
            ])
            ->assertRedirect(route('admin.billing.plans.index'));

        $this->assertDatabaseHas('billing_plans', [
            'plan_key' => 'up_to_250',
            'label' => 'Up to 250 seats',
            'is_active' => false,
            'monthly_price_id' => 'price_250monthv2',
        ]);

        $this->actingAs($admin, 'admin')
            ->delete(route('admin.billing.plans.destroy', $plan->fresh()))
            ->assertRedirect(route('admin.billing.plans.index'));

        $this->assertDatabaseMissing('billing_plans', [
            'plan_key' => 'up_to_250',
        ]);
    }

    public function test_cannot_delete_plan_when_it_is_assigned(): void
    {
        $admin = $this->makeAdmin('super_admin');

        $plan = BillingPlan::query()->create([
            'plan_key' => 'up_to_999',
            'label' => 'Up to 999 users',
            'seat_limit' => 999,
            'monthly_amount' => 99900,
            'annual_amount' => 999000,
            'monthly_price_id' => 'price_999month',
            'annual_price_id' => 'price_999year',
            'is_active' => true,
            'sort_order' => 999,
        ]);

        Company::query()->create([
            'company_id' => 'FAC-PLAN999',
            'name' => 'Assigned Plan Company',
            'country' => 'NG',
            'team_size' => '2-10',
            'use_case' => 'startup',
            'status' => 'active',
            'activated_at' => now(),
            'subscription_status' => 'pending_payment',
            'assigned_plan_key' => 'up_to_999',
        ]);

        $this->actingAs($admin, 'admin')
            ->delete(route('admin.billing.plans.destroy', $plan))
            ->assertSessionHas('error');

        $this->assertDatabaseHas('billing_plans', [
            'plan_key' => 'up_to_999',
        ]);
    }

    public function test_super_admin_can_toggle_billing_enforcement_and_api_reflects_it(): void
    {
        $admin = $this->makeAdmin('super_admin');

        $this->actingAs($admin, 'admin')
            ->post(route('admin.billing.enforcement.update'), ['enabled' => '0'])
            ->assertRedirect(route('admin.billing.index'));

        $this->assertDatabaseHas('platform_settings', [
            'key' => BillingEnforcementSettingService::KEY,
            'value' => 'false',
            'updated_by_admin_id' => $admin->id,
        ]);

        ['user' => $owner] = $this->createCompanyWithOwner();

        $response = $this->withToken($this->ownerToken($owner))
            ->getJson('/api/v1/billing/status');

        $response->assertOk()
            ->assertJsonPath('data.billing_enforced', false);
    }

    public function test_toggling_enforcement_keeps_billing_status_and_user_me_consistent(): void
    {
        $admin = $this->makeAdmin('super_admin');
        ['user' => $owner] = $this->createCompanyWithOwner();
        $token = $this->ownerToken($owner);

        // Enforcement ON (default) with pending subscription => not active anywhere.
        $status = $this->withToken($token)->getJson('/api/v1/billing/status');
        $me = $this->withToken($token)->getJson('/api/v1/user/me');

        $status->assertOk()
            ->assertJsonPath('data.billing_enforced', true)
            ->assertJsonPath('data.has_active_subscription', false)
            ->assertJsonPath('data.has_paid_subscription', false);
        $me->assertOk()
            ->assertJsonPath('data.billing.billing_enforced', true)
            ->assertJsonPath('data.billing.has_active_subscription', false)
            ->assertJsonPath('data.billing.has_paid_subscription', false);

        // Turn enforcement OFF via admin toggle.
        $this->actingAs($admin, 'admin')
            ->post(route('admin.billing.enforcement.update'), ['enabled' => '0'])
            ->assertRedirect(route('admin.billing.index'));

        $status = $this->withToken($token)->getJson('/api/v1/billing/status');
        $me = $this->withToken($token)->getJson('/api/v1/user/me');

        $status->assertOk()
            ->assertJsonPath('data.billing_enforced', false)
            ->assertJsonPath('data.has_active_subscription', true)
            ->assertJsonPath('data.has_paid_subscription', false);
        $me->assertOk()
            ->assertJsonPath('data.billing.billing_enforced', false)
            ->assertJsonPath('data.billing.has_active_subscription', true)
            ->assertJsonPath('data.billing.has_paid_subscription', false);
    }

    private function makeAdmin(string $role): Admin
    {
        return Admin::query()->create([
            'name' => ucfirst($role) . ' Admin',
            'email' => $role . '-' . uniqid('', true) . '@example.com',
            'password' => 'StrongPass123!',
            'role' => $role,
            'is_active' => true,
        ]);
    }
}
