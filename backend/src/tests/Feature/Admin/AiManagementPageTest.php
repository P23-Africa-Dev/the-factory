<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Admin;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class AiManagementPageTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_ai_index_renders_when_ai_logs_table_exists(): void
    {
        $admin = Admin::create([
            'name' => 'Ops Admin',
            'email' => 'admin@example.com',
            'password' => 'StrongPass123!',
            'role' => 'super_admin',
            'is_active' => true,
        ]);

        $this->actingAs($admin, 'admin')
            ->get(route('admin.ai.index'))
            ->assertOk()
            ->assertSee('AI Operations Center');
    }

    public function test_admin_ai_index_renders_when_ai_logs_table_is_missing(): void
    {
        Schema::dropIfExists('ai_logs');

        $admin = Admin::create([
            'name' => 'Ops Admin',
            'email' => 'admin@example.com',
            'password' => 'StrongPass123!',
            'role' => 'super_admin',
            'is_active' => true,
        ]);

        $this->actingAs($admin, 'admin')
            ->get(route('admin.ai.index'))
            ->assertOk()
            ->assertSee('AI logs storage is not available yet. Run migrations to enable full AI analytics.');
    }
}
