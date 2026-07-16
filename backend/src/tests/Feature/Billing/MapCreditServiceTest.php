<?php

declare(strict_types=1);

namespace Tests\Feature\Billing;

use App\Models\CompanyMapCredit;
use App\Services\Billing\CreditAllocationSettingService;
use App\Services\Billing\MapCreditService;
use App\Models\PlatformSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\ActivatesCompanySubscription;
use Tests\TestCase;

class MapCreditServiceTest extends TestCase
{
    use ActivatesCompanySubscription;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withBillingEnforcement();
    }

    private function service(): MapCreditService
    {
        return app(MapCreditService::class);
    }

    public function test_allocation_is_five_percent_of_monthly_price_in_credits(): void
    {
        ['company' => $company] = $this->createCompanyWithOwner();
        $this->activateCompanySubscription($company, 'up_to_5');

        // $99/mo * 5% = $4.95 = 495 credits at 100 credits per $1.
        $this->assertSame(495.0, $this->service()->allocationCredits($company->fresh()));
    }

    public function test_snapshot_seeds_plan_credits_equal_to_allocation(): void
    {
        ['company' => $company] = $this->createCompanyWithOwner();
        $this->activateCompanySubscription($company, 'up_to_5');

        $snapshot = $this->service()->snapshot($company->fresh());

        $this->assertSame(495.0, $snapshot['allocation_credits']);
        $this->assertSame(495.0, $snapshot['plan_credits']);
        $this->assertSame(495.0, $snapshot['balance']);
        $this->assertTrue($snapshot['metered']);
    }

    public function test_consume_deducts_plan_credits_then_topup(): void
    {
        ['company' => $company] = $this->createCompanyWithOwner();
        $this->activateCompanySubscription($company, 'up_to_5');
        $service = $this->service();
        $service->ensureRecord($company->fresh());

        // Force a small plan balance and some top-up to exercise the waterfall.
        CompanyMapCredit::query()->where('company_id', $company->id)->update([
            'plan_credits' => 1.0,
            'topup_credits' => 5.0,
        ]);

        // nearby costs 3.2 credits: 1 from plan, 2.2 from top-up.
        $result = $service->consume($company->fresh(), 'nearby', 'dashboard');

        $this->assertTrue($result['allowed']);
        $record = CompanyMapCredit::query()->where('company_id', $company->id)->first();
        $this->assertEqualsWithDelta(0.0, (float) $record->plan_credits, 0.0001);
        $this->assertEqualsWithDelta(2.8, (float) $record->topup_credits, 0.0001);
    }

    public function test_consume_blocks_when_no_credits_remain(): void
    {
        ['company' => $company] = $this->createCompanyWithOwner();
        $this->activateCompanySubscription($company, 'up_to_5');
        $service = $this->service();
        $service->ensureRecord($company->fresh());

        CompanyMapCredit::query()->where('company_id', $company->id)->update([
            'plan_credits' => 0,
            'topup_credits' => 0,
        ]);

        $result = $service->consume($company->fresh(), 'nearby', 'dashboard');

        $this->assertFalse($result['allowed']);
        $this->assertTrue($result['blocked']);
    }

    public function test_reset_refreshes_plan_credits_but_keeps_topups(): void
    {
        ['company' => $company] = $this->createCompanyWithOwner();
        $this->activateCompanySubscription($company, 'up_to_5');
        $service = $this->service();
        $service->ensureRecord($company->fresh());

        CompanyMapCredit::query()->where('company_id', $company->id)->update([
            'plan_credits' => 100,
            'topup_credits' => 50,
        ]);

        $service->resetPlanCredits($company->fresh());

        $record = CompanyMapCredit::query()->where('company_id', $company->id)->first();
        $this->assertSame(495.0, (float) $record->plan_credits);
        $this->assertSame(50.0, (float) $record->topup_credits);
    }

    public function test_topup_adds_rollover_credits(): void
    {
        ['company' => $company] = $this->createCompanyWithOwner();
        $this->activateCompanySubscription($company, 'up_to_5');
        $service = $this->service();

        $service->addTopup($company->fresh(), 1000, ['source' => 'test']);

        $record = CompanyMapCredit::query()->where('company_id', $company->id)->first();
        $this->assertSame(1000.0, (float) $record->topup_credits);
        $this->assertSame(1000.0, (float) $record->lifetime_topped_up);
    }

    public function test_percent_change_changes_allocation(): void
    {
        ['company' => $company] = $this->createCompanyWithOwner();
        $this->activateCompanySubscription($company, 'up_to_5');

        PlatformSetting::setValue(CreditAllocationSettingService::KEY_PERCENT, '10');

        // $99/mo * 10% = $9.90 = 990 credits.
        $this->assertSame(990.0, $this->service()->allocationCredits($company->fresh()));
    }

    public function test_unmetered_when_enforcement_disabled(): void
    {
        ['company' => $company] = $this->createCompanyWithOwner();
        $this->activateCompanySubscription($company, 'up_to_5');
        $service = $this->service();
        $service->ensureRecord($company->fresh());

        CompanyMapCredit::query()->where('company_id', $company->id)->update([
            'plan_credits' => 0,
            'topup_credits' => 0,
        ]);

        PlatformSetting::setValue(CreditAllocationSettingService::KEY_ENFORCE, 'false');

        // With enforcement off, calls are allowed even at zero balance.
        $result = $service->consume($company->fresh(), 'nearby', 'dashboard');
        $this->assertTrue($result['allowed']);
        $this->assertFalse($result['metered']);

        // Balance untouched (unmetered), but usage still tracked.
        $record = CompanyMapCredit::query()->where('company_id', $company->id)->first();
        $this->assertSame(0.0, (float) $record->plan_credits);
        $this->assertGreaterThan(0.0, (float) $record->lifetime_consumed);
    }

    public function test_consume_endpoint_returns_402_when_exhausted(): void
    {
        ['user' => $user, 'company' => $company] = $this->createCompanyWithOwner();
        $this->activateCompanySubscription($company, 'up_to_5');
        $this->service()->ensureRecord($company->fresh());

        CompanyMapCredit::query()->where('company_id', $company->id)->update([
            'plan_credits' => 0,
            'topup_credits' => 0,
        ]);

        $this->withToken($this->ownerToken($user))
            ->postJson('/api/v1/map-credits/consume', ['sku' => 'nearby', 'source' => 'dashboard'])
            ->assertStatus(402)
            ->assertJsonPath('data.blocked', true);
    }

    public function test_snapshot_endpoint_returns_balance(): void
    {
        ['user' => $user, 'company' => $company] = $this->createCompanyWithOwner();
        $this->activateCompanySubscription($company, 'up_to_5');

        $this->withToken($this->ownerToken($user))
            ->getJson('/api/v1/map-credits')
            ->assertOk()
            ->assertJsonPath('data.allocation_credits', 495)
            ->assertJsonPath('data.metered', true);
    }
}
