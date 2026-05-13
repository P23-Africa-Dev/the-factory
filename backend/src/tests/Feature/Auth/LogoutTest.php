<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

class LogoutTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_user_can_logout(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test-token', ['*'])->plainTextToken;

        $response = $this->withToken($token)->postJson('/api/v1/auth/logout');

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'message' => 'Logged out successfully.',
            ]);

        // Verify token was deleted from database
        $this->assertDatabaseMissing('personal_access_tokens', [
            'name' => 'test-token',
            'tokenable_id' => $user->id,
        ]);
    }

    public function test_logout_revokes_only_current_token(): void
    {
        $user = User::factory()->create();
        $token1 = $user->createToken('token-1', ['*'])->plainTextToken;
        $token2 = $user->createToken('token-2', ['*'])->plainTextToken;

        $this->withToken($token1)->postJson('/api/v1/auth/logout');

        // Token 1 deleted, token 2 remains
        $this->assertDatabaseMissing('personal_access_tokens', ['name' => 'token-1', 'tokenable_id' => $user->id]);
        $this->assertDatabaseHas('personal_access_tokens', ['name' => 'token-2', 'tokenable_id' => $user->id]);
    }

    public function test_unauthenticated_user_cannot_logout(): void
    {
        $response = $this->postJson('/api/v1/auth/logout');

        $response->assertUnauthorized()
            ->assertJson(['success' => false]);
    }
}
