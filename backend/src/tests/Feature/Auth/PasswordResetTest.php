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

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'app.frontend_url' => 'https://thefactory23.com',
            'app.agent_pwa_url' => 'https://app.thefactory23.com',
        ]);
    }

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

    public function test_owner_can_request_and_complete_password_reset(): void
    {
        Notification::fake();

        /** @var User $user */
        $user = User::factory()->create([
            'email' => 'owner@example.com',
            'password' => bcrypt('old-password1'),
            'is_active' => true,
            'internal_role' => null,
        ]);

        $this->postJson('/api/v1/auth/forgot-password', [
            'email' => 'owner@example.com',
            'portal' => 'management',
        ])->assertOk();

        $resetUrl = $this->extractResetUrlFromNotification($user);
        $this->assertStringContainsString('thefactory23.com/reset-password/', $resetUrl);

        parse_str((string) parse_url($resetUrl, PHP_URL_QUERY), $query);
        $token = basename((string) parse_url($resetUrl, PHP_URL_PATH));

        $response = $this->postJson('/api/v1/auth/reset-password', [
            'email' => 'owner@example.com',
            'token' => $token,
            'password' => 'Newpassword123',
            'password_confirmation' => 'Newpassword123',
            'portal' => 'management',
        ]);

        $response->assertOk()->assertJsonPath('data.redirect_path', '/login');
        $this->assertTrue(Hash::check('Newpassword123', $user->fresh()->password));
    }

    public function test_supervisor_can_request_and_complete_password_reset(): void
    {
        Notification::fake();

        /** @var User $user */
        $user = User::factory()->create([
            'email' => 'supervisor@example.com',
            'password' => bcrypt('old-password1'),
            'is_active' => true,
            'internal_role' => 'supervisor',
        ]);

        $this->postJson('/api/v1/auth/forgot-password', [
            'email' => 'supervisor@example.com',
            'portal' => 'management',
        ])->assertOk();

        Notification::assertSentTo($user, PasswordResetLinkNotification::class);

        /** @var \Illuminate\Auth\Passwords\PasswordBroker $broker */
        $broker = Password::broker('users');
        $token = $broker->createToken($user);

        $this->postJson('/api/v1/auth/reset-password', [
            'email' => 'supervisor@example.com',
            'token' => $token,
            'password' => 'Newpassword123',
            'password_confirmation' => 'Newpassword123',
            'portal' => 'management',
        ])->assertOk()->assertJsonPath('data.redirect_path', '/login');
    }

    public function test_internal_admin_can_request_and_complete_password_reset(): void
    {
        Notification::fake();

        /** @var User $user */
        $user = User::factory()->create([
            'email' => 'admin@example.com',
            'password' => bcrypt('old-password1'),
            'is_active' => true,
            'internal_role' => 'admin',
        ]);

        $this->postJson('/api/v1/auth/forgot-password', [
            'email' => 'admin@example.com',
            'portal' => 'management',
        ])->assertOk();

        Notification::assertSentTo($user, PasswordResetLinkNotification::class);

        /** @var \Illuminate\Auth\Passwords\PasswordBroker $broker */
        $broker = Password::broker('users');
        $token = $broker->createToken($user);

        $this->postJson('/api/v1/auth/reset-password', [
            'email' => 'admin@example.com',
            'token' => $token,
            'password' => 'Newpassword123',
            'password_confirmation' => 'Newpassword123',
            'portal' => 'management',
        ])->assertOk()->assertJsonPath('data.redirect_path', '/login');
    }

    public function test_agent_reset_link_uses_agent_pwa_host_when_portal_is_agent(): void
    {
        Notification::fake();

        /** @var User $user */
        $user = User::factory()->create([
            'email' => 'agent@example.com',
            'is_active' => true,
            'internal_role' => 'agent',
        ]);

        $this->postJson('/api/v1/auth/forgot-password', [
            'email' => 'agent@example.com',
            'portal' => 'agent',
        ])->assertOk();

        $resetUrl = $this->extractResetUrlFromNotification($user);
        $this->assertStringContainsString('app.thefactory23.com/reset-password/', $resetUrl);
        $this->assertStringContainsString('portal=agent', $resetUrl);
    }

    public function test_management_reset_link_uses_management_host_when_portal_is_management(): void
    {
        Notification::fake();

        /** @var User $user */
        $user = User::factory()->create([
            'email' => 'manager@example.com',
            'is_active' => true,
            'internal_role' => null,
        ]);

        $this->postJson('/api/v1/auth/forgot-password', [
            'email' => 'manager@example.com',
            'portal' => 'management',
        ])->assertOk();

        $resetUrl = $this->extractResetUrlFromNotification($user);
        $this->assertStringContainsString('thefactory23.com/reset-password/', $resetUrl);
        $this->assertStringNotContainsString('app.thefactory23.com', $resetUrl);
    }

    public function test_portal_mismatch_still_sends_password_reset_email(): void
    {
        Notification::fake();

        /** @var User $user */
        $user = User::factory()->create([
            'email' => 'agent@example.com',
            'is_active' => true,
            'internal_role' => 'agent',
        ]);

        $this->postJson('/api/v1/auth/forgot-password', [
            'email' => 'agent@example.com',
            'portal' => 'management',
        ])->assertOk();

        Notification::assertSentTo($user, PasswordResetLinkNotification::class);

        $resetUrl = $this->extractResetUrlFromNotification($user);
        $this->assertStringContainsString('thefactory23.com/reset-password/', $resetUrl);
        $this->assertStringContainsString('portal=management', $resetUrl);
    }

    public function test_agent_reset_redirects_to_agent_login_when_portal_is_agent(): void
    {
        /** @var User $user */
        $user = User::factory()->create([
            'email' => 'agent@example.com',
            'password' => bcrypt('old-password1'),
            'is_active' => true,
            'internal_role' => 'agent',
        ]);

        /** @var \Illuminate\Auth\Passwords\PasswordBroker $broker */
        $broker = Password::broker('users');
        $token = $broker->createToken($user);

        $this->postJson('/api/v1/auth/reset-password', [
            'email' => 'agent@example.com',
            'token' => $token,
            'password' => 'Newpassword123',
            'password_confirmation' => 'Newpassword123',
            'portal' => 'agent',
        ])->assertOk()->assertJsonPath('data.redirect_path', '/agent/login');
    }

    public function test_inactive_user_receives_generic_success_without_notification(): void
    {
        Notification::fake();

        /** @var User $user */
        $user = User::factory()->create([
            'email' => 'inactive@example.com',
            'is_active' => false,
        ]);

        $this->postJson('/api/v1/auth/forgot-password', [
            'email' => 'inactive@example.com',
            'portal' => 'management',
        ])->assertOk()
            ->assertJsonPath('message', 'If an account exists with this email, a password reset link has been sent.');

        Notification::assertNotSentTo($user, PasswordResetLinkNotification::class);
    }

    public function test_suspended_user_receives_generic_success_without_notification(): void
    {
        Notification::fake();

        /** @var User $user */
        $user = User::factory()->create([
            'email' => 'suspended@example.com',
            'is_active' => true,
            'suspended_until' => now()->addDay(),
        ]);

        $this->postJson('/api/v1/auth/forgot-password', [
            'email' => 'suspended@example.com',
            'portal' => 'management',
        ])->assertOk()
            ->assertJsonPath('message', 'If an account exists with this email, a password reset link has been sent.');

        Notification::assertNotSentTo($user, PasswordResetLinkNotification::class);
    }

    private function extractResetUrlFromNotification(User $user): string
    {
        $notification = null;

        Notification::assertSentTo(
            $user,
            PasswordResetLinkNotification::class,
            function (PasswordResetLinkNotification $sentNotification) use (&$notification): bool {
                $notification = $sentNotification;

                return true;
            },
        );

        $this->assertNotNull($notification);

        $mail = $notification->toMail($user);

        return (string) $mail->actionUrl;
    }
}
