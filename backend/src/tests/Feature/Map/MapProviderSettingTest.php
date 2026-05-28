<?php

declare(strict_types=1);

namespace Tests\Feature\Map;

use App\Models\Admin;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MapProviderSettingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware(PreventRequestForgery::class);
    }

    public function test_admin_can_update_global_map_provider_from_dashboard(): void
    {
        $admin = Admin::create([
            'name' => 'Ops Admin',
            'email' => 'map-admin@example.com',
            'password' => 'StrongPass123!',
            'role' => 'super_admin',
            'is_active' => true,
        ]);

        $this->actingAs($admin, 'admin')
            ->post(route('admin.settings.map-provider.update'), [
                'provider' => 'google',
            ])
            ->assertRedirect(route('admin.dashboard'))
            ->assertSessionHas('status');

        $this->assertDatabaseHas('platform_settings', [
            'key' => 'map.provider',
            'value' => 'google',
            'updated_by_admin_id' => $admin->id,
        ]);
    }

    public function test_public_api_returns_fallback_provider_when_unconfigured(): void
    {
        config()->set('maps.default_provider', 'mapbox');

        $this->getJson('/api/v1/map/provider')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.provider', 'mapbox');
    }

    public function test_public_api_returns_admin_selected_provider(): void
    {
        $admin = Admin::create([
            'name' => 'Ops Admin',
            'email' => 'map-admin2@example.com',
            'password' => 'StrongPass123!',
            'role' => 'super_admin',
            'is_active' => true,
        ]);

        $this->actingAs($admin, 'admin')
            ->post(route('admin.settings.map-provider.update'), [
                'provider' => 'google',
            ])
            ->assertRedirect(route('admin.dashboard'));

        $this->getJson('/api/v1/map/provider')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.provider', 'google');
    }
}
