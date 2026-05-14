<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Admin;
use Database\Seeders\AdminUserSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AdminUserSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_user_seeder_creates_admin_from_config_values(): void
    {
        config()->set('admin.seed.default_name', 'Platform Admin');
        config()->set('admin.seed.default_email', 'SeedAdmin@Example.com');
        config()->set('admin.seed.default_password', 'ChangeMe123!');
        config()->set('admin.seed.default_role', 'super_admin');

        // Call seeder directly so config()->set() overrides are preserved.
        // $this->seed() uses artisan which re-bootstraps config from .env.
        (new AdminUserSeeder())->run();

        $admin = Admin::where('email', 'seedadmin@example.com')->first();

        $this->assertNotNull($admin);
        $this->assertSame('Platform Admin', $admin->name);
        $this->assertSame('super_admin', $admin->role);
        $this->assertTrue($admin->is_active);
        $this->assertTrue(Hash::check('ChangeMe123!', (string) $admin->password));
    }
}
