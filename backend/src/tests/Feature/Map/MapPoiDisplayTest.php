<?php

declare(strict_types=1);

namespace Tests\Feature\Map;

use App\Models\CompanyMapCredit;
use App\Models\PlatformSetting;
use App\Services\Billing\CreditAllocationSettingService;
use App\Services\Billing\MapCreditService;
use App\Services\Map\MapPoiDisplaySettingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\ActivatesCompanySubscription;
use Tests\TestCase;

class MapPoiDisplayTest extends TestCase
{
    use ActivatesCompanySubscription;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withBillingEnforcement();
    }

    private function settingService(): MapPoiDisplaySettingService
    {
        return app(MapPoiDisplaySettingService::class);
    }

    private function creditService(): MapCreditService
    {
        return app(MapCreditService::class);
    }

    private function disableGlobal(): void
    {
        PlatformSetting::setValue(MapPoiDisplaySettingService::KEY, 'false');
    }

    public function test_defaults_to_enabled_when_unset(): void
    {
        ['company' => $company] = $this->createCompanyWithOwner();

        $this->assertTrue($this->settingService()->globalEnabled());
        $this->assertTrue($this->settingService()->isEnabledForCompany($company->fresh()));
    }

    public function test_global_off_disables_for_company_without_override(): void
    {
        ['company' => $company] = $this->createCompanyWithOwner();
        $this->disableGlobal();

        $this->assertFalse($this->settingService()->globalEnabled());
        $this->assertFalse($this->settingService()->isEnabledForCompany($company->fresh()));
    }

    public function test_company_override_on_wins_over_global_off(): void
    {
        ['company' => $company] = $this->createCompanyWithOwner();
        $this->disableGlobal();

        $this->settingService()->setCompanyOverride($company, true);

        $this->assertTrue($this->settingService()->isEnabledForCompany($company->fresh()));
    }

    public function test_company_override_off_wins_over_global_on(): void
    {
        ['company' => $company] = $this->createCompanyWithOwner();

        $this->settingService()->setCompanyOverride($company, false);

        $this->assertTrue($this->settingService()->globalEnabled());
        $this->assertFalse($this->settingService()->isEnabledForCompany($company->fresh()));
    }

    public function test_consume_blocks_nearby_and_poi_details_when_disabled(): void
    {
        ['company' => $company] = $this->createCompanyWithOwner();
        $this->activateCompanySubscription($company, 'up_to_5');
        $service = $this->creditService();
        $record = $service->ensureRecord($company->fresh());
        $planBefore = (float) $record->plan_credits;

        $this->disableGlobal();

        foreach (['nearby', 'poi-details'] as $sku) {
            $result = $service->consume($company->fresh(), $sku, 'dashboard');

            $this->assertFalse($result['allowed'], "{$sku} should be blocked");
            $this->assertTrue($result['blocked']);
            $this->assertSame('poi_display_disabled', $result['reason']);
        }

        // No credits deducted and no usage recorded for the blocked SKUs.
        $fresh = CompanyMapCredit::query()->where('company_id', $company->id)->first();
        $this->assertSame($planBefore, (float) $fresh->plan_credits);
        $this->assertSame(0.0, (float) $fresh->lifetime_consumed);
    }

    public function test_consume_blocks_even_when_unmetered(): void
    {
        ['company' => $company] = $this->createCompanyWithOwner();
        $this->activateCompanySubscription($company, 'up_to_5');
        $this->creditService()->ensureRecord($company->fresh());

        PlatformSetting::setValue(CreditAllocationSettingService::KEY_ENFORCE, 'false');
        $this->disableGlobal();

        $result = $this->creditService()->consume($company->fresh(), 'nearby', 'dashboard');

        $this->assertFalse($result['allowed']);
        $this->assertTrue($result['blocked']);
        $this->assertFalse($result['metered']);
    }

    public function test_consume_allows_nearby_when_company_override_on(): void
    {
        ['company' => $company] = $this->createCompanyWithOwner();
        $this->activateCompanySubscription($company, 'up_to_5');
        $service = $this->creditService();
        $service->ensureRecord($company->fresh());

        $this->disableGlobal();
        $this->settingService()->setCompanyOverride($company, true);

        $result = $service->consume($company->fresh(), 'nearby', 'dashboard');

        $this->assertTrue($result['allowed']);
        $this->assertFalse($result['blocked']);
    }

    public function test_search_skus_unaffected_when_disabled(): void
    {
        ['company' => $company] = $this->createCompanyWithOwner();
        $this->activateCompanySubscription($company, 'up_to_5');
        $service = $this->creditService();
        $service->ensureRecord($company->fresh());

        $this->disableGlobal();

        foreach (['autocomplete', 'details'] as $sku) {
            $result = $service->consume($company->fresh(), $sku, 'dashboard');

            $this->assertTrue($result['allowed'], "{$sku} should keep working");
            $this->assertFalse($result['blocked']);
        }
    }

    public function test_endpoint_returns_effective_flag(): void
    {
        ['user' => $user, 'company' => $company] = $this->createCompanyWithOwner();
        $this->activateCompanySubscription($company, 'up_to_5');

        $this->withToken($this->ownerToken($user))
            ->getJson('/api/v1/map/poi-display')
            ->assertOk()
            ->assertJsonPath('data.enabled', true)
            ->assertJsonPath('data.global_enabled', true);

        $this->disableGlobal();

        $this->withToken($this->ownerToken($user))
            ->getJson('/api/v1/map/poi-display')
            ->assertOk()
            ->assertJsonPath('data.enabled', false)
            ->assertJsonPath('data.global_enabled', false);
    }
}
