<?php

declare(strict_types=1);

namespace Tests\Unit\Avatar;

use App\Services\Avatar\AvatarStorageService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AvatarStorageServiceTest extends TestCase
{
    use RefreshDatabase;

    private function configureAvatarsDisk(): AvatarStorageService
    {
        Storage::fake('public');

        config([
            'internal_onboarding.avatar_storage_root' => 'avatar',
            'internal_onboarding.default_avatar_path' => 'avatar/default/ghost.svg',
        ]);

        return app(AvatarStorageService::class);
    }

    public function test_resolve_url_for_catalog_key(): void
    {
        $service = $this->configureAvatarsDisk();
        $service->disk()->put('avatar/male/male_01.png', 'png');

        $url = $service->resolveUrl('male_01', 'male');

        $this->assertStringContainsString('/avatar/male/male_01.png', (string) $url);
    }

    public function test_store_custom_avatar_writes_to_avatars_disk(): void
    {
        $service = $this->configureAvatarsDisk();
        $file = UploadedFile::fake()->image('avatar.png', 120, 120);

        $path = $service->storeCustom($file, 42);

        $this->assertStringStartsWith('avatar/custom/user_42_', $path);
        $this->assertTrue($service->disk()->exists($path));
    }

    public function test_delete_if_orphaned_removes_unreferenced_custom_avatar(): void
    {
        $service = $this->configureAvatarsDisk();
        $path = 'avatar/custom/user_99_deadbeef.png';
        $service->disk()->put($path, 'avatar');

        $service->deleteIfOrphaned($path);

        $this->assertFalse($service->disk()->exists($path));
    }

    public function test_resolve_url_or_default_returns_default_when_missing(): void
    {
        $service = $this->configureAvatarsDisk();
        $service->disk()->put('avatar/default/ghost.svg', '<svg></svg>');

        $url = $service->resolveUrlOrDefault(null, null);

        $this->assertStringContainsString('avatar/default/ghost.svg', $url);
    }
}
