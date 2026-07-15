<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Admin;
use App\Services\Billing\CreditAllocationSettingService;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\ActivatesCompanySubscription;
use Tests\TestCase;

class MapCreditAdminTest extends TestCase
{
    use ActivatesCompanySubscription;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware(PreventRequestForgery::class);
        $this->withBillingEnforcement();
    }

    public function test_super_admin_can_view_map_credit_dashboard(): void
    {
        $admin = $this->makeAdmin('super_admin');

        $this->actingAs($admin, 'admin')
            ->get(route('admin.map-credits.index'))
            ->assertOk();
    }

    public function test_non_super_admin_cannot_view_map_credit_dashboard(): void
    {
        $admin = $this->makeAdmin('admin');

        $this->actingAs($admin, 'admin')
            ->get(route('admin.map-credits.index'))
            ->assertForbidden();
    }

    public function test_super_admin_can_update_credit_settings(): void
    {
        $admin = $this->makeAdmin('super_admin');

        $this->actingAs($admin, 'admin')
            ->post(route('admin.map-credits.settings.update'), [
                'allocation_percent' => 7,
                'credits_per_usd' => 100,
                'low_threshold_percent' => 20,
                'enforce' => '1',
            ])
            ->assertRedirect(route('admin.map-credits.index'));

        $this->assertDatabaseHas('platform_settings', [
            'key' => CreditAllocationSettingService::KEY_PERCENT,
            'value' => '7',
            'updated_by_admin_id' => $admin->id,
        ]);
    }

    public function test_super_admin_can_create_sku(): void
    {
        $admin = $this->makeAdmin('super_admin');

        $this->actingAs($admin, 'admin')
            ->post(route('admin.map-credits.skus.store'), [
                'sku' => 'directions',
                'label' => 'Directions API',
                'credit_cost' => 0.5,
                'is_active' => '1',
                'sort_order' => 10,
            ])
            ->assertRedirect(route('admin.map-credits.index'));

        $this->assertDatabaseHas('map_credit_skus', [
            'sku' => 'directions',
            'label' => 'Directions API',
        ]);
    }

    public function test_super_admin_can_view_company_usage_page(): void
    {
        $admin = $this->makeAdmin('super_admin');
        ['company' => $company] = $this->createCompanyWithOwner();
        $this->activateCompanySubscription($company, 'up_to_5');

        $this->actingAs($admin, 'admin')
            ->get(route('admin.map-credits.companies.show', $company->fresh()))
            ->assertOk();
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
