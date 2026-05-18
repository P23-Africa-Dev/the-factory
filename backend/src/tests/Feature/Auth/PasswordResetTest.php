<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Enums\VerificationType;
use App\Models\User;
use App\Notifications\OtpNotification;
use App\Services\Auth\OtpService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class PasswordResetTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_request_a_password_reset_code(): void
    {
        Notification::fake();

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
                'message' => 'If the email exists, a password reset code has been sent.',
            ])
            ->assertJsonStructure(['data' => ['email']]);

        Notification::assertSentTo($user, OtpNotification::class);

        $this->assertDatabaseHas('user_verifications', [
            'email' => 'jane@example.com',
            'type' => VerificationType::PASSWORD_RESET->value,
        ]);
    }

    public function test_user_can_reset_password_with_a_valid_code(): void
    {
        Notification::fake();

        $user = User::factory()->create([
            'email' => 'jane@example.com',
            'password' => bcrypt('old-password1'),
            'is_active' => true,
        ]);

        /** @var OtpService $otpService */
        $otpService = app(OtpService::class);
        $otp = $otpService->generate('jane@example.com', VerificationType::PASSWORD_RESET->value);

        $response = $this->postJson('/api/v1/auth/reset-password', [
            'email' => 'jane@example.com',
            'otp' => $otp,
            'password' => 'Newpassword123',
            'password_confirmation' => 'Newpassword123',
        ]);

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'message' => 'Password reset successfully.',
            ]);

        $this->assertTrue(Hash::check('Newpassword123', $user->fresh()->password));
        $this->assertDatabaseHas('user_verifications', [
            'email' => 'jane@example.com',
            'type' => VerificationType::PASSWORD_RESET->value,
        ]);
    }

    public function test_user_cannot_reset_password_with_an_invalid_code(): void
    {
        $user = User::factory()->create([
            'email' => 'jane@example.com',
            'password' => bcrypt('old-password1'),
            'is_active' => true,
        ]);

        /** @var OtpService $otpService */
        $otpService = app(OtpService::class);
        $otpService->generate('jane@example.com', VerificationType::PASSWORD_RESET->value);

        $response = $this->postJson('/api/v1/auth/reset-password', [
            'email' => 'jane@example.com',
            'otp' => '000000',
            'password' => 'Newpassword123',
            'password_confirmation' => 'Newpassword123',
        ]);

        $response->assertStatus(422)
            ->assertJson(['success' => false]);

        $this->assertTrue(Hash::check('old-password1', $user->fresh()->password));
    }
}
