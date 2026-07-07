<?php

declare(strict_types=1);

namespace Tests\Feature\Demo;

use App\Enums\SubscriptionStatus;
use App\Models\Company;
use App\Models\User;
use App\Services\Billing\SubscriptionLifecycleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\Support\ActivatesCompanySubscription;
use Tests\TestCase;

final class DemoCompanyAccessTest extends TestCase
{
    use ActivatesCompanySubscription;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withBillingEnforcement();
    }

    public function test_demo_company_has_effective_subscription_access_without_payment(): void
    {
        ['user' => $user, 'company' => $company] = $this->createCompanyWithOwner([
            'is_demo' => true,
            'subscription_status' => SubscriptionStatus::GRACE->value,
            'subscription_grace_ends_at' => '2038-01-01 00:00:00',
        ]);

        $this->assertTrue($company->fresh()->hasEffectiveSubscriptionAccess());

        $response = $this->withToken($this->ownerToken($user))
            ->getJson('/api/v1/billing/status');

        $response
            ->assertOk()
            ->assertJsonPath('data.is_demo', true)
            ->assertJsonPath('data.has_active_subscription', true);
    }

    public function test_demo_company_can_access_dashboard_without_paid_subscription(): void
    {
        ['user' => $user] = $this->createCompanyWithOwner([
            'is_demo' => true,
            'subscription_status' => SubscriptionStatus::GRACE->value,
            'subscription_grace_ends_at' => '2038-01-01 00:00:00',
        ]);

        $this->withToken($this->ownerToken($user))
            ->getJson('/api/v1/dashboard/overview')
            ->assertOk();
    }

    public function test_subscription_lifecycle_does_not_suspend_demo_companies(): void
    {
        $company = Company::query()->create([
            'company_id' => 'FAC-DEMO' . strtoupper(Str::random(4)),
            'name' => 'Demo Lifecycle Co',
            'country' => 'GB',
            'team_size' => '2-10',
            'use_case' => 'demo',
            'status' => 'active',
            'activated_at' => now(),
            'is_demo' => true,
            'subscription_status' => SubscriptionStatus::GRACE->value,
            'subscription_grace_ends_at' => now()->subDay(),
        ]);

        app(SubscriptionLifecycleService::class)->process();

        $this->assertSame(
            SubscriptionStatus::GRACE->value,
            $company->fresh()->subscription_status,
        );
    }

    public function test_user_me_exposes_is_demo_on_active_company(): void
    {
        ['user' => $user] = $this->createCompanyWithOwner([
            'is_demo' => true,
            'subscription_status' => SubscriptionStatus::GRACE->value,
            'subscription_grace_ends_at' => '2038-01-01 00:00:00',
        ]);

        $this->withToken($this->ownerToken($user))
            ->getJson('/api/v1/user/me')
            ->assertOk()
            ->assertJsonPath('data.active_company.is_demo', true)
            ->assertJsonPath('data.active_company.has_active_subscription', true);
    }
}
