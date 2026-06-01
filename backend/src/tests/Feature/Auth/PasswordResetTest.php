<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\User;
use App\Notifications\PasswordResetLinkNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Tests\TestCase;

class PasswordResetTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_request_a_password_reset_link(): void
    {
        Notification::fake();

        /** @var User $user */
        $user = User::factory()->create([
            'email' => 'jane@example.com',
            'is_active' => true,
        ]);

        $response = $this->postJson('/api/v1/auth/forgot-password', [
            'email' => 'jane@example.com',
        ]);

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'message' => 'If an account exists with this email, a password reset link has been sent.',
                'data' => null,
            ]);

        Notification::assertSentTo($user, PasswordResetLinkNotification::class);
    }

    public function test_reset_link_request_remains_generic_for_unknown_email(): void
    {
        Notification::fake();

        $response = $this->postJson('/api/v1/auth/forgot-password', [
            'email' => 'unknown@example.com',
            'portal' => 'management',
        ]);

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'message' => 'If an account exists with this email, a password reset link has been sent.',
                'data' => null,
            ]);

        Notification::assertNothingSent();
    }

    public function test_user_can_validate_a_password_reset_token(): void
    {
        /** @var User $user */
        $user = User::factory()->create([
            'email' => 'jane@example.com',
            'is_active' => true,
        ]);

        /** @var \Illuminate\Auth\Passwords\PasswordBroker $broker */
        $broker = Password::broker('users');
        $token = $broker->createToken($user);

        $response = $this->getJson('/api/v1/auth/reset-password/' . urlencode($token) . '?email=jane@example.com&portal=management');

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.valid', true);
    }

    public function test_user_can_reset_password_with_valid_reset_token(): void
    {
        /** @var User $user */
        $user = User::factory()->create([
            'email' => 'jane@example.com',
            'password' => bcrypt('old-password1'),
            'is_active' => true,
            'internal_role' => null,
        ]);

        $user->createToken('existing-session', ['*'], now()->addDay());
        /** @var \Illuminate\Auth\Passwords\PasswordBroker $broker */
        $broker = Password::broker('users');
        $token = $broker->createToken($user);

        $response = $this->postJson('/api/v1/auth/reset-password', [
            'email' => 'jane@example.com',
            'token' => $token,
            'password' => 'Newpassword123',
            'password_confirmation' => 'Newpassword123',
            'portal' => 'management',
        ]);

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'message' => 'Password reset successfully.',
            ]);

        $response->assertJsonPath('data.redirect_path', '/login');

        $this->assertTrue(Hash::check('Newpassword123', $user->fresh()->password));
        $this->assertDatabaseMissing('personal_access_tokens', [
            'tokenable_id' => $user->id,
        ]);
    }

    public function test_user_cannot_reset_password_with_an_invalid_or_expired_token(): void
    {
        /** @var User $user */
        $user = User::factory()->create([
            'email' => 'jane@example.com',
            'password' => bcrypt('old-password1'),
            'is_active' => true,
        ]);

        $response = $this->postJson('/api/v1/auth/reset-password', [
            'email' => 'jane@example.com',
            'token' => 'invalid-token-value-that-will-never-match-the-broker',
            'password' => 'Newpassword123',
            'password_confirmation' => 'Newpassword123',
            'portal' => 'management',
        ]);

        $response->assertStatus(422)
            ->assertJson(['success' => false]);

        $this->assertTrue(Hash::check('old-password1', $user->fresh()->password));
    }
}
