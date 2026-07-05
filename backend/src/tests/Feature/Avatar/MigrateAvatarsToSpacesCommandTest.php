<?php

declare(strict_types=1);

namespace Tests\Feature\Avatar;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class MigrateAvatarsToSpacesCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_dry_run_reports_custom_migration_without_writing(): void
    {
        Storage::fake('avatars');
        Storage::fake('public');

        config([
            'filesystems.avatar_disk' => 'avatars',
            'filesystems.disks.avatars.url' => 'https://factory23-storage.lon1.cdn.digitaloceanspaces.com',
        ]);

        $path = 'avatar/custom/user_1_test.png';
        Storage::disk('public')->put($path, 'avatar-bytes');

        User::factory()->create([
            'avatar' => $path,
        ]);

        $this->artisan('avatars:migrate-to-spaces', [
            '--dry-run' => true,
            '--only-custom' => true,
        ])->assertSuccessful();

        $this->assertFalse(Storage::disk('avatars')->exists($path));
    }

    public function test_command_uploads_custom_avatar_from_local_public_disk(): void
    {
        Storage::fake('avatars');
        Storage::fake('public');

        config([
            'filesystems.avatar_disk' => 'avatars',
            'filesystems.disks.avatars.url' => 'https://factory23-storage.lon1.cdn.digitaloceanspaces.com',
        ]);

        $path = 'avatar/custom/user_2_test.png';
        Storage::disk('public')->put($path, 'avatar-bytes');

        User::factory()->create([
            'avatar' => $path,
        ]);

        $this->artisan('avatars:migrate-to-spaces', [
            '--only-custom' => true,
        ])->assertSuccessful();

        $this->assertTrue(Storage::disk('avatars')->exists($path));
    }
}
