<?php

declare(strict_types=1);

namespace Tests\Feature\Internal;

use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AvatarApiTest extends TestCase
{
    public function test_avatar_endpoint_requires_gender_query_param(): void
    {
        $response = $this->getJson('/api/v1/avatars');

        $response->assertUnprocessable()
            ->assertJsonStructure(['errors' => ['gender']]);
    }

    public function test_avatar_endpoint_returns_storage_backed_avatars_for_gender(): void
    {
        Storage::fake('avatars');

        config([
            'filesystems.avatar_disk' => 'avatars',
            'filesystems.disks.avatars.url' => 'https://factory23-storage.lon1.digitaloceanspaces.com',
        ]);

        $basePath = trim((string) config('internal_onboarding.avatar_storage_root', 'avatar'), '/');

        for ($i = 1; $i <= 16; $i++) {
            Storage::disk('avatars')->put("{$basePath}/male/male_{$i}.svg", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>');
        }

        Storage::disk('avatars')->put("{$basePath}/male/male_17.svg", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>');

        // Unsupported files are ignored by the endpoint.
        Storage::disk('avatars')->put("{$basePath}/male/readme.txt", 'not-an-avatar');

        $response = $this->getJson('/api/v1/avatars?gender=male&limit=12');

        $response->assertOk()
            ->assertJson(['success' => true])
            ->assertJsonStructure(['data', 'meta' => ['cursor', 'limit', 'next_cursor', 'has_more', 'total']]);

        // All 17 avatars should be counted in meta.total (txt excluded)
        $this->assertGreaterThanOrEqual(17, $response->json('meta.total'));

        $avatarData = $response->json('data');
        $this->assertNotEmpty($avatarData);

        $urls = array_column($avatarData, 'url');
        $this->assertNotContains('https://factory23-storage.lon1.digitaloceanspaces.com/avatar/male/readme.txt', $urls);

        $firstUrl = (string) $avatarData[0]['url'];
        $this->assertStringContainsString('/avatar/male/', $firstUrl);
        $this->assertStringEndsWith('.svg', $firstUrl);
        $this->assertStringNotContainsString('localhost:8080', $firstUrl);
    }

    public function test_avatar_endpoint_rejects_invalid_gender(): void
    {
        $response = $this->getJson('/api/v1/avatars?gender=other');

        $response->assertUnprocessable()
            ->assertJsonStructure(['errors' => ['gender']]);
    }
}
