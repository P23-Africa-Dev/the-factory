<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Admin;
use App\Models\AdminActionLog;
use App\Models\User;
use App\Services\Admin\Database\DatabasePasscodeService;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class DatabaseManagerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(PreventRequestForgery::class);
        config()->set('admin_database.master_reset_token', 'test-master-token-abc');
        config()->set('admin_database.unlock_ttl_minutes', 15);
    }

    private function makeAdmin(string $role = 'super_admin'): Admin
    {
        return Admin::query()->create([
            'name' => ucfirst($role) . ' Admin',
            'email' => $role . '-' . uniqid('', true) . '@example.com',
            'password' => 'StrongPass123!',
            'role' => $role,
            'is_active' => true,
        ]);
    }

    private function setPasscode(Admin $admin, string $passcode): void
    {
        app(DatabasePasscodeService::class)->setPasscode($passcode, $admin);
    }

    private function unlockedActingAs(Admin $admin): static
    {
        return $this->actingAs($admin, 'admin')->withSession([
            'db_manager.unlocked_at' => now()->toIso8601String(),
            'db_manager.unlocked_admin_id' => $admin->id,
        ]);
    }

    public function test_non_super_admin_gets_403(): void
    {
        $admin = $this->makeAdmin('admin');

        $this->actingAs($admin, 'admin')
            ->get(route('admin.database.lock.show'))
            ->assertForbidden();

        $this->actingAs($admin, 'admin')
            ->get(route('admin.database.index'))
            ->assertForbidden();
    }

    public function test_guest_is_redirected_to_login(): void
    {
        $this->get(route('admin.database.lock.show'))
            ->assertRedirect(route('admin.login.show'));
    }

    public function test_lock_screen_renders_for_super_admin(): void
    {
        $admin = $this->makeAdmin('super_admin');
        $this->actingAs($admin, 'admin')
            ->get(route('admin.database.lock.show'))
            ->assertOk()
            ->assertSee('Manage Database')
            ->assertSee('Sensitive Environment');
    }

    public function test_index_requires_unlock(): void
    {
        $admin = $this->makeAdmin('super_admin');
        $this->setPasscode($admin, 'CorrectHorse123');

        $this->actingAs($admin, 'admin')
            ->get(route('admin.database.index'))
            ->assertRedirect(route('admin.database.lock.show'));
    }

    public function test_admin_can_unlock_with_correct_passcode(): void
    {
        $admin = $this->makeAdmin('super_admin');
        $this->setPasscode($admin, 'CorrectHorse123');

        $this->actingAs($admin, 'admin')
            ->post(route('admin.database.unlock'), ['passcode' => 'CorrectHorse123'])
            ->assertRedirect(route('admin.database.index'));

        $this->assertDatabaseHas('admin_action_logs', ['action' => 'db_manager.unlock.success']);
    }

    public function test_unlock_fails_with_wrong_passcode(): void
    {
        $admin = $this->makeAdmin('super_admin');
        $this->setPasscode($admin, 'CorrectHorse123');

        $this->actingAs($admin, 'admin')
            ->post(route('admin.database.unlock'), ['passcode' => 'wrong'])
            ->assertSessionHasErrors('passcode');

        $this->assertDatabaseHas('admin_action_logs', ['action' => 'db_manager.unlock.failed']);
    }

    public function test_master_token_can_reset_passcode(): void
    {
        $admin = $this->makeAdmin('super_admin');

        $this->actingAs($admin, 'admin')
            ->post(route('admin.database.passcode.reset'), [
                'master_token' => 'test-master-token-abc',
                'new_passcode' => 'FreshPass2026!',
                'new_passcode_confirmation' => 'FreshPass2026!',
            ])
            ->assertRedirect(route('admin.database.lock.show'));

        $this->assertTrue(app(DatabasePasscodeService::class)->verify('FreshPass2026!'));
        $this->assertDatabaseHas('admin_action_logs', ['action' => 'db_manager.passcode.reset.success']);
    }

    public function test_master_token_reset_fails_with_wrong_token(): void
    {
        $admin = $this->makeAdmin('super_admin');

        $this->actingAs($admin, 'admin')
            ->post(route('admin.database.passcode.reset'), [
                'master_token' => 'nope',
                'new_passcode' => 'FreshPass2026!',
                'new_passcode_confirmation' => 'FreshPass2026!',
            ])
            ->assertSessionHasErrors('master_token');
    }

    public function test_unlocked_admin_can_view_index_and_tables(): void
    {
        $admin = $this->makeAdmin('super_admin');
        $this->setPasscode($admin, 'CorrectHorse123');

        $this->unlockedActingAs($admin)
            ->get(route('admin.database.index'))
            ->assertOk()
            ->assertSee('users');
    }

    public function test_unlocked_admin_sees_sensitive_marker_on_users_table(): void
    {
        $admin = $this->makeAdmin('super_admin');
        $this->setPasscode($admin, 'CorrectHorse123');

        $this->unlockedActingAs($admin)
            ->get(route('admin.database.tables.show', 'users'))
            ->assertOk()
            ->assertSee('Sensitive');
    }

    public function test_row_create_and_update_and_delete(): void
    {
        $admin = $this->makeAdmin('super_admin');
        $this->setPasscode($admin, 'CorrectHorse123');

        // Insert a row into platform_settings via the manager
        $this->unlockedActingAs($admin)
            ->post(route('admin.database.rows.store', 'platform_settings'), [
                'key' => 'test.key',
                'value' => 'v1',
            ])
            ->assertRedirect();

        $this->assertDatabaseHas('platform_settings', ['key' => 'test.key', 'value' => 'v1']);

        $id = DB::table('platform_settings')->where('key', 'test.key')->value('id');

        $this->unlockedActingAs($admin)
            ->patch(route('admin.database.rows.update', ['table' => 'platform_settings', 'id' => $id]), [
                'key' => 'test.key',
                'value' => 'v2',
            ])
            ->assertRedirect();

        $this->assertDatabaseHas('platform_settings', ['key' => 'test.key', 'value' => 'v2']);

        $this->unlockedActingAs($admin)
            ->delete(route('admin.database.rows.destroy', ['table' => 'platform_settings', 'id' => $id]))
            ->assertRedirect();

        $this->assertDatabaseMissing('platform_settings', ['key' => 'test.key']);

        $this->assertDatabaseHas('admin_action_logs', ['action' => 'db_manager.row.create']);
        $this->assertDatabaseHas('admin_action_logs', ['action' => 'db_manager.row.update']);
        $this->assertDatabaseHas('admin_action_logs', ['action' => 'db_manager.row.delete']);
    }

    public function test_schema_create_and_drop_table(): void
    {
        $admin = $this->makeAdmin('super_admin');
        $this->setPasscode($admin, 'CorrectHorse123');

        $this->unlockedActingAs($admin)
            ->post(route('admin.database.tables.store'), [
                'name' => 'test_dbm_playground',
                'columns' => [
                    ['name' => 'label', 'type' => 'string', 'nullable' => 1],
                ],
            ])
            ->assertRedirect();

        $this->assertTrue(Schema::hasTable('test_dbm_playground'));

        $this->unlockedActingAs($admin)
            ->delete(route('admin.database.tables.destroy', 'test_dbm_playground'))
            ->assertRedirect(route('admin.database.index'));

        $this->assertFalse(Schema::hasTable('test_dbm_playground'));

        $this->assertDatabaseHas('admin_action_logs', ['action' => 'db_manager.schema.table.create']);
        $this->assertDatabaseHas('admin_action_logs', ['action' => 'db_manager.schema.table.drop']);
    }

    public function test_undroppable_tables_cannot_be_dropped(): void
    {
        $admin = $this->makeAdmin('super_admin');
        $this->setPasscode($admin, 'CorrectHorse123');

        $response = $this->unlockedActingAs($admin)
            ->delete(route('admin.database.tables.destroy', 'users'));

        $this->assertTrue(Schema::hasTable('users'));
        // Route hits DatabaseSchemaService which throws; Laravel renders 500 by default.
        $this->assertGreaterThanOrEqual(400, $response->getStatusCode());
    }

    public function test_column_add_and_drop(): void
    {
        $admin = $this->makeAdmin('super_admin');
        $this->setPasscode($admin, 'CorrectHorse123');

        // Set up a sandbox table via schema
        Schema::create('test_dbm_columns', function ($t): void {
            $t->id();
            $t->timestamps();
        });

        $this->unlockedActingAs($admin)
            ->post(route('admin.database.columns.store', 'test_dbm_columns'), [
                'name' => 'note',
                'type' => 'string',
                'nullable' => 1,
            ])
            ->assertRedirect();

        $this->assertTrue(Schema::hasColumn('test_dbm_columns', 'note'));

        $this->unlockedActingAs($admin)
            ->delete(route('admin.database.columns.destroy', ['table' => 'test_dbm_columns', 'column' => 'note']))
            ->assertRedirect();

        $this->assertFalse(Schema::hasColumn('test_dbm_columns', 'note'));

        Schema::drop('test_dbm_columns');
    }
}
