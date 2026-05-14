<?php

namespace Database\Seeders;

use App\Models\Admin;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Log;

class AdminUserSeeder extends Seeder
{
    public function run(): void
    {
        $email = strtolower(trim((string) config('admin.seed.default_email', '')));
        $password = (string) config('admin.seed.default_password', '');

        if (! $email || ! $password) {
            Log::warning('AdminUserSeeder skipped because admin seed credentials are missing.', [
                'has_email' => $email !== '',
                'has_password' => $password !== '',
            ]);

            return;
        }

        Admin::updateOrCreate(
            ['email' => $email],
            [
                'name' => (string) config('admin.seed.default_name', 'Platform Admin'),
                'password' => $password,
                'role' => (string) config('admin.seed.default_role', 'super_admin'),
                'is_active' => true,
            ],
        );

        Log::info('AdminUserSeeder ensured default admin user exists.', [
            'email' => $email,
            'role' => (string) config('admin.seed.default_role', 'super_admin'),
        ]);
    }
}
