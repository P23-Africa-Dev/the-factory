<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Admin;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminAuthenticationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware(PreventRequestForgery::class);
    }

    public function test_admin_login_page_is_accessible(): void
    {
        $this->get('/admin/login')
            ->assertOk()
            ->assertSee('Sign in to your admin account');
    }

    public function test_admin_can_login_with_valid_credentials(): void
    {
        Admin::create([
            'name' => 'Ops Admin',
            'email' => 'admin@example.com',
            'password' => 'StrongPass123!',
            'role' => 'super_admin',
            'is_active' => true,
        ]);

        $response = $this->post('/admin/login', [
            'email' => 'admin@example.com',
            'password' => 'StrongPass123!',
        ]);

        $response->assertRedirect(route('admin.dashboard'));
        $this->assertAuthenticated('admin');
    }

    public function test_admin_can_login_with_trimmed_and_case_insensitive_email(): void
    {
        Admin::create([
            'name' => 'Ops Admin',
            'email' => 'admin@example.com',
            'password' => 'StrongPass123!',
            'role' => 'super_admin',
            'is_active' => true,
        ]);

        $response = $this->post('/admin/login', [
            'email' => '  Admin@Example.com  ',
            'password' => 'StrongPass123!',
        ]);

        $response->assertRedirect(route('admin.dashboard'));
        $this->assertAuthenticated('admin');
    }

    public function test_inactive_admin_cannot_login(): void
    {
        Admin::create([
            'name' => 'Inactive Admin',
            'email' => 'inactive@example.com',
            'password' => 'StrongPass123!',
            'role' => 'admin',
            'is_active' => false,
        ]);

        $response = $this->from('/admin/login')->post('/admin/login', [
            'email' => 'inactive@example.com',
            'password' => 'StrongPass123!',
        ]);

        $response->assertRedirect('/admin/login');
        $response->assertSessionHasErrors('email');
        $this->assertGuest('admin');
    }

    public function test_admin_dashboard_requires_authentication(): void
    {
        $this->get('/admin/dashboard')
            ->assertRedirect('/admin/login');
    }

    public function test_supervisor_admin_can_access_user_management_routes(): void
    {
        $admin = Admin::create([
            'name' => 'Supervisor Admin',
            'email' => 'supervisor-admin@example.com',
            'password' => 'StrongPass123!',
            'role' => 'supervisor',
            'is_active' => true,
        ]);

        $this->actingAs($admin, 'admin')
            ->get(route('admin.users.index'))
            ->assertOk();
    }
}
