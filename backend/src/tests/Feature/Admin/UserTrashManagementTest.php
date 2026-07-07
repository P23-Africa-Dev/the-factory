<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Admin;
use App\Models\User;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserTrashManagementTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(PreventRequestForgery::class);
    }

    private function actingAsAdmin(): static
    {
        $admin = Admin::query()->create([
            'name' => 'Trash Admin',
            'email' => 'trash-' . uniqid('', true) . '@example.com',
            'password' => 'Password123!',
            'role' => 'super_admin',
            'is_active' => true,
        ]);
        return $this->actingAs($admin, 'admin');
    }

    private function makeUser(array $attrs = []): User
    {
        static $seq = 0;
        $seq++;
        return User::create(array_merge([
            'name' => "Trash User {$seq}",
            'email' => "trash-user-{$seq}-" . uniqid('', true) . '@example.com',
            'password' => 'Password123!',
            'is_active' => true,
        ], $attrs));
    }

    public function test_trashed_users_appear_in_trash_scope(): void
    {
        $active = $this->makeUser();
        $trashed = $this->makeUser();
        $trashed->delete();

        $this->actingAsAdmin()
            ->get(route('admin.users.index', ['trash' => 'trashed']))
            ->assertOk()
            ->assertSee($trashed->email)
            ->assertDontSee($active->email);
    }

    public function test_active_scope_hides_trashed_users(): void
    {
        $active = $this->makeUser();
        $trashed = $this->makeUser();
        $trashed->delete();

        $this->actingAsAdmin()
            ->get(route('admin.users.index'))
            ->assertOk()
            ->assertSee($active->email)
            ->assertDontSee($trashed->email);
    }

    public function test_all_scope_shows_both_active_and_trashed_users(): void
    {
        $active = $this->makeUser();
        $trashed = $this->makeUser();
        $trashed->delete();

        $this->actingAsAdmin()
            ->get(route('admin.users.index', ['trash' => 'all']))
            ->assertOk()
            ->assertSee($active->email)
            ->assertSee($trashed->email);
    }

    public function test_admin_can_restore_trashed_user(): void
    {
        $user = $this->makeUser();
        $user->delete();
        $this->assertSoftDeleted('users', ['id' => $user->id]);

        $this->actingAsAdmin()
            ->post(route('admin.users.restore', $user->id))
            ->assertRedirect(route('admin.users.show', $user->id));

        $this->assertDatabaseHas('users', ['id' => $user->id, 'deleted_at' => null]);
    }

    public function test_admin_can_force_delete_trashed_user(): void
    {
        $user = $this->makeUser();
        $user->delete();

        $this->actingAsAdmin()
            ->delete(route('admin.users.force-destroy', $user->id))
            ->assertRedirect();

        $this->assertDatabaseMissing('users', ['id' => $user->id]);
    }

    public function test_show_page_can_render_trashed_user(): void
    {
        $user = $this->makeUser();
        $user->delete();

        $this->actingAsAdmin()
            ->get(route('admin.users.show', $user->id))
            ->assertOk()
            ->assertSee($user->email);
    }

    public function test_soft_delete_still_moves_user_to_trash(): void
    {
        $user = $this->makeUser();
        $this->actingAsAdmin()
            ->delete(route('admin.users.destroy', $user))
            ->assertRedirect();

        $this->assertSoftDeleted('users', ['id' => $user->id]);
    }
}
