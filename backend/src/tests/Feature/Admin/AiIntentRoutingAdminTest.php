<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Admin;
use App\Services\AI\AiIntentRoutingSettingService;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Tests\TestCase;

final class AiIntentRoutingAdminTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        $this->withoutMiddleware(PreventRequestForgery::class);
    }

    public function test_super_admin_can_switch_to_ai_first_routing(): void
    {
        $admin = $this->makeAdmin('super_admin');

        $this->actingAs($admin, 'admin')
            ->post(route('admin.ai.intent-routing.update'), [
                'mode' => AiIntentRoutingSettingService::AI_FIRST,
            ])
            ->assertRedirect(route('admin.ai.index'))
            ->assertSessionHas('status');

        $this->assertDatabaseHas('platform_settings', [
            'key' => 'ai.intent_routing',
            'value' => 'ai_first',
            'updated_by_admin_id' => $admin->id,
        ]);
        $this->assertSame(AiIntentRoutingSettingService::AI_FIRST, app(AiIntentRoutingSettingService::class)->getMode());
    }

    public function test_non_super_admin_cannot_switch_intent_routing(): void
    {
        $admin = $this->makeAdmin('admin');

        $this->actingAs($admin, 'admin')
            ->post(route('admin.ai.intent-routing.update'), [
                'mode' => AiIntentRoutingSettingService::AI_FIRST,
            ])
            ->assertForbidden();

        $this->assertDatabaseMissing('platform_settings', [
            'key' => 'ai.intent_routing',
            'value' => 'ai_first',
        ]);
    }

    private function makeAdmin(string $role): Admin
    {
        return Admin::create([
            'name' => 'AI Admin ' . $role,
            'email' => $role . '-' . Str::lower(Str::random(6)) . '@example.com',
            'password' => 'StrongPass123!',
            'role' => $role,
            'is_active' => true,
        ]);
    }
}
