<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Admin;
use App\Models\User;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserManagementTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware(PreventRequestForgery::class);
    }

    public function test_admin_can_view_users_index(): void
    {
        $admin = Admin::create([
            'name' => 'Ops Admin',
            'email' => 'admin@example.com',
            'password' => 'StrongPass123!',
            'role' => 'super_admin',
            'is_active' => true,
        ]);

        User::factory()->create([
            'name' => 'Jane Doe',
            'email' => 'jane@example.com',
            'is_active' => true,
        ]);

        $this->actingAs($admin, 'admin')
            ->get('/admin/users')
            ->assertOk()
            ->assertSee('Users')
            ->assertSee('jane@example.com');
    }

    public function test_admin_can_deactivate_and_activate_user(): void
    {
        $admin = Admin::create([
            'name' => 'Ops Admin',
            'email' => 'admin@example.com',
            'password' => 'StrongPass123!',
            'role' => 'super_admin',
            'is_active' => true,
        ]);

        $user = User::factory()->create([
            'is_active' => true,
            'deactivated_at' => null,
        ]);

        $this->actingAs($admin, 'admin')
            ->patch(route('admin.users.status.update', $user), ['is_active' => false])
            ->assertRedirect(route('admin.users.show', $user));

        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'is_active' => false,
        ]);

        $this->actingAs($admin, 'admin')
            ->patch(route('admin.users.status.update', $user), ['is_active' => true])
            ->assertRedirect(route('admin.users.show', $user));

        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'is_active' => true,
            'deactivated_at' => null,
        ]);
    }

    public function test_non_admin_cannot_access_admin_users(): void
    {
        $this->get('/admin/users')
            ->assertRedirect('/admin/login');
    }
}

class UserManagementExtendedTest extends \Tests\TestCase
{
    use \Illuminate\Foundation\Testing\RefreshDatabase;

    private function actingAsAdmin(): static
    {
        $admin = \App\Models\Admin::create([
            'name'      => 'Test Admin',
            'email'     => 'admin2@example.com',
            'password'  => 'Password123!',
            'role'      => 'super_admin',
            'is_active' => true,
        ]);
        return $this->actingAs($admin, 'admin');
    }

    private function makeUser(array $attrs = []): \App\Models\User
    {
        static $seq = 0;
        $seq++;
        return \App\Models\User::create(array_merge([
            'name'      => "User {$seq}",
            'email'     => "extuser{$seq}@example.com",
            'password'  => 'Password123!',
            'is_active' => true,
        ], $attrs));
    }

    public function test_users_index_filters_by_suspended_status(): void
    {
        $this->makeUser();
        $this->makeUser(['suspended_until' => now()->addDays(3)]);
        $this->actingAsAdmin()
            ->get(route('admin.users.index', ['status' => 'suspended']))
            ->assertOk()->assertSee('Suspended');
    }

    public function test_ext_admin_can_suspend_user_by_duration(): void
    {
        $user = $this->makeUser();
        $this->actingAsAdmin()
            ->post(route('admin.users.suspend', $user), ['suspend_type' => 'duration', 'suspend_days' => 7])
            ->assertRedirect(route('admin.users.show', $user))
            ->assertSessionHas('status');
        $user->refresh();
        $this->assertTrue($user->isSuspended());
    }

    public function test_ext_admin_can_suspend_user_by_custom_date(): void
    {
        $user = $this->makeUser();
        $this->actingAsAdmin()
            ->post(route('admin.users.suspend', $user), ['suspend_type' => 'date', 'suspend_until' => now()->addDays(14)->toDateString()])
            ->assertRedirect(route('admin.users.show', $user));
        $this->assertTrue($user->fresh()->isSuspended());
    }

    public function test_suspend_rejects_zero_days(): void
    {
        $user = $this->makeUser();
        $this->actingAsAdmin()
            ->post(route('admin.users.suspend', $user), ['suspend_type' => 'duration', 'suspend_days' => 0])
            ->assertSessionHasErrors('suspend_days');
    }

    public function test_suspend_rejects_past_date(): void
    {
        $user = $this->makeUser();
        $this->actingAsAdmin()
            ->post(route('admin.users.suspend', $user), ['suspend_type' => 'date', 'suspend_until' => now()->subDay()->toDateString()])
            ->assertSessionHasErrors('suspend_until');
    }

    public function test_ext_admin_can_reactivate_suspended_user(): void
    {
        $user = $this->makeUser(['suspended_until' => now()->addDays(5)]);
        $this->actingAsAdmin()
            ->post(route('admin.users.reactivate', $user))
            ->assertRedirect(route('admin.users.show', $user));
        $user->refresh();
        $this->assertNull($user->suspended_until);
        $this->assertTrue($user->is_active);
    }

    public function test_ext_admin_can_reactivate_inactive_user(): void
    {
        $user = $this->makeUser(['is_active' => false, 'deactivated_at' => now()->subDay()]);
        $this->actingAsAdmin()
            ->post(route('admin.users.reactivate', $user))
            ->assertRedirect(route('admin.users.show', $user));
        $user->refresh();
        $this->assertTrue($user->is_active);
        $this->assertNull($user->deactivated_at);
    }

    public function test_ext_admin_can_soft_delete_user(): void
    {
        $user = $this->makeUser();
        $this->actingAsAdmin()
            ->delete(route('admin.users.destroy', $user))
            ->assertRedirect(route('admin.users.index'));
        $this->assertSoftDeleted('users', ['id' => $user->id]);
    }

    public function test_deleted_user_not_in_index(): void
    {
        $user = $this->makeUser();
        $user->delete();
        $this->actingAsAdmin()
            ->get(route('admin.users.index'))
            ->assertOk()
            ->assertDontSee($user->email);
    }

    public function test_ext_admin_can_update_user_role(): void
    {
        $user = $this->makeUser();
        $this->actingAsAdmin()
            ->patch(route('admin.users.role.update', $user), ['internal_role' => 'supervisor'])
            ->assertRedirect(route('admin.users.show', $user));
        $this->assertSame('supervisor', $user->fresh()->internal_role);
    }

    public function test_ext_admin_can_clear_user_role(): void
    {
        $user = $this->makeUser(['internal_role' => 'agent']);
        $this->actingAsAdmin()
            ->patch(route('admin.users.role.update', $user), ['internal_role' => ''])
            ->assertRedirect();
        $this->assertNull($user->fresh()->internal_role);
    }

    public function test_invalid_role_is_rejected(): void
    {
        $user = $this->makeUser();
        $this->actingAsAdmin()
            ->patch(route('admin.users.role.update', $user), ['internal_role' => 'hacker'])
            ->assertSessionHasErrors('internal_role');
    }

    public function test_lift_expired_suspensions_command(): void
    {
        $expired = $this->makeUser(['suspended_until' => now()->subHour()]);
        $active  = $this->makeUser(['suspended_until' => now()->addDays(3)]);
        $this->artisan(\App\Console\Commands\LiftExpiredSuspensions::class)->assertSuccessful();
        $this->assertNull($expired->fresh()->suspended_until);
        $this->assertNotNull($active->fresh()->suspended_until);
    }
}
