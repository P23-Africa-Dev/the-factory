<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Admin;
use App\Services\Map\MapPoiDisplaySettingService;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\ActivatesCompanySubscription;
use Tests\TestCase;

class MapPoiDisplayAdminTest extends TestCase
{
    use ActivatesCompanySubscription;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware(PreventRequestForgery::class);
        $this->withBillingEnforcement();
    }

    public function test_super_admin_can_view_business_pins_dashboard(): void
    {
        $admin = $this->makeAdmin('super_admin');

        $this->actingAs($admin, 'admin')
            ->get(route('admin.map-display.index'))
            ->assertOk();
    }

    public function test_non_super_admin_cannot_view_business_pins_dashboard(): void
    {
        $admin = $this->makeAdmin('admin');

        $this->actingAs($admin, 'admin')
            ->get(route('admin.map-display.index'))
            ->assertForbidden();
    }

    public function test_super_admin_can_toggle_global_setting(): void
    {
        $admin = $this->makeAdmin('super_admin');

        $this->actingAs($admin, 'admin')
            ->post(route('admin.map-display.global.update'), ['enabled' => '0'])
            ->assertRedirect(route('admin.map-display.index'));

        $this->assertDatabaseHas('platform_settings', [
            'key' => MapPoiDisplaySettingService::KEY,
            'value' => 'false',
            'updated_by_admin_id' => $admin->id,
        ]);

        $this->assertFalse(app(MapPoiDisplaySettingService::class)->globalEnabled());
    }

    public function test_super_admin_can_set_company_override(): void
    {
        $admin = $this->makeAdmin('super_admin');
        ['company' => $company] = $this->createCompanyWithOwner();

        $this->actingAs($admin, 'admin')
            ->post(route('admin.map-display.companies.update', $company), ['override' => 'off'])
            ->assertRedirect();

        $this->assertFalse((bool) $company->fresh()->map_poi_display_enabled);

        // Switching back to inherit clears the override.
        $this->actingAs($admin, 'admin')
            ->post(route('admin.map-display.companies.update', $company), ['override' => 'inherit'])
            ->assertRedirect();

        $this->assertNull($company->fresh()->map_poi_display_enabled);
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
