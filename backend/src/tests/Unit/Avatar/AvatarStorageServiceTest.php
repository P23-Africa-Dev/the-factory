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
        Storage::fake('avatars');

        config([
            'filesystems.avatar_disk' => 'avatars',
            'filesystems.avatar_public_base_url' => 'https://factory23-storage.lon1.digitaloceanspaces.com',
            'internal_onboarding.avatar_storage_root' => 'avatar',
            'internal_onboarding.default_avatar_path' => 'avatar/default/ghost.svg',
            'internal_onboarding.avatar_catalog' => [],
        ]);

        return app(AvatarStorageService::class);
    }

    public function test_resolve_url_for_catalog_key(): void
    {
        $service = $this->configureAvatarsDisk();
        $service->disk()->put('avatar/male/male_01.png', 'png');

        $url = $service->resolveUrl('male_01', 'male');

        $this->assertStringContainsString('/avatar/male/male_01.png', (string) $url);
        $this->assertStringContainsString('factory23-storage', (string) $url);
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

    public function test_random_catalog_key_for_gender_returns_gender_bucket_key(): void
    {
        $service = $this->configureAvatarsDisk();
        $service->disk()->put('avatar/male/male_01.png', 'png');
        $service->disk()->put('avatar/male/male_02.png', 'png');
        $service->disk()->put('avatar/female/female_01.png', 'png');

        $maleKey = $service->randomCatalogKeyForGender('male');
        $femaleKey = $service->randomCatalogKeyForGender('female');

        $this->assertContains($maleKey, ['male_01', 'male_02']);
        $this->assertSame('female_01', $femaleKey);
    }

    public function test_stable_catalog_key_for_gender_is_deterministic(): void
    {
        $service = $this->configureAvatarsDisk();
        $service->disk()->put('avatar/male/male_01.png', 'png');
        $service->disk()->put('avatar/male/male_02.png', 'png');

        $first = $service->stableCatalogKeyForGender('male', 'oliver.bennett@thefactory23.com');
        $second = $service->stableCatalogKeyForGender('male', 'oliver.bennett@thefactory23.com');

        $this->assertSame($first, $second);
        $this->assertContains($first, ['male_01', 'male_02']);
    }

    public function test_random_catalog_key_falls_back_when_gender_missing(): void
    {
        $service = $this->configureAvatarsDisk();
        $service->disk()->put('avatar/female/female_01.png', 'png');

        $key = $service->randomCatalogKeyForGender(null);

        $this->assertSame('female_01', $key);
    }
}
