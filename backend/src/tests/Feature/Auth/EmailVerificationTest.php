<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Models\User;
use App\Models\UserVerification;
use App\Notifications\WelcomeNotification;
use App\Services\Auth\OtpService;
use Illuminate\Contracts\Notifications\Dispatcher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery\MockInterface;
use Tests\TestCase;

class EmailVerificationTest extends TestCase
{
    use RefreshDatabase;

    private OtpService $otpService;

    protected function setUp(): void
    {
        parent::setUp();
        $this->otpService = app(OtpService::class);
    }

    // -----------------------------------------------------------------------
    // Happy path
    // -----------------------------------------------------------------------

    public function test_user_can_verify_email_with_valid_otp(): void
    {
        $user = User::factory()->create([
            'email' => 'jane@example.com',
            'email_verified_at' => null,
        ]);

        $otp = $this->otpService->generate('jane@example.com', 'registration');

        $response = $this->postJson('/api/v1/auth/verify-email', [
            'email' => 'jane@example.com',
            'otp_code' => $otp,
        ]);

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'message' => 'Email verified successfully. Welcome to The Factory!',
            ])
            ->assertJsonStructure([
                'data' => ['token', 'token_type', 'expires_in_days', 'user', 'onboarding_completed'],
            ]);

        $this->assertNotNull($user->fresh()->email_verified_at);
    }

    public function test_verification_returns_bearer_token(): void
    {
        User::factory()->create(['email' => 'jane@example.com', 'email_verified_at' => null]);
        $otp = $this->otpService->generate('jane@example.com', 'registration');

        $response = $this->postJson('/api/v1/auth/verify-email', [
            'email' => 'jane@example.com',
            'otp_code' => $otp,
        ]);

        $response->assertOk();
        $this->assertSame('Bearer', $response->json('data.token_type'));
        $this->assertNotEmpty($response->json('data.token'));
    }

    public function test_onboarding_completed_is_false_for_new_user(): void
    {
        User::factory()->create(['email' => 'jane@example.com', 'email_verified_at' => null]);
        $otp = $this->otpService->generate('jane@example.com', 'registration');

        $response = $this->postJson('/api/v1/auth/verify-email', [
            'email' => 'jane@example.com',
            'otp_code' => $otp,
        ]);

        $response->assertOk();
        $this->assertFalse($response->json('data.onboarding_completed'));
    }

    // -----------------------------------------------------------------------
    // Failure cases
    // -----------------------------------------------------------------------

    public function test_verification_fails_with_wrong_otp(): void
    {
        User::factory()->create(['email' => 'jane@example.com', 'email_verified_at' => null]);
        $this->otpService->generate('jane@example.com', 'registration');

        $response = $this->postJson('/api/v1/auth/verify-email', [
            'email' => 'jane@example.com',
            'otp_code' => '000000',
        ]);

        $response->assertUnprocessable()
            ->assertJson(['success' => false])
            ->assertJsonStructure(['errors' => ['otp_code']]);
    }

    public function test_verification_fails_with_expired_otp(): void
    {
        User::factory()->create(['email' => 'jane@example.com', 'email_verified_at' => null]);

        UserVerification::create([
            'email' => 'jane@example.com',
            'otp_code' => hash_hmac('sha256', '123456', config('app.key')),
            'type' => 'registration',
            'expires_at' => now()->subMinutes(15), // already expired
            'used_at' => null,
        ]);

        $response = $this->postJson('/api/v1/auth/verify-email', [
            'email' => 'jane@example.com',
            'otp_code' => '123456',
        ]);

        $response->assertUnprocessable()->assertJson(['success' => false]);
    }

    public function test_verification_fails_for_nonexistent_email(): void
    {
        $response = $this->postJson('/api/v1/auth/verify-email', [
            'email' => 'ghost@example.com',
            'otp_code' => '123456',
        ]);

        $response->assertUnprocessable()
            ->assertJsonStructure(['errors' => ['email']]);
    }

    public function test_otp_is_marked_as_used_after_successful_verification(): void
    {
        User::factory()->create(['email' => 'jane@example.com', 'email_verified_at' => null]);
        $otp = $this->otpService->generate('jane@example.com', 'registration');

        $this->postJson('/api/v1/auth/verify-email', [
            'email' => 'jane@example.com',
            'otp_code' => $otp,
        ])->assertOk();

        // Second attempt with same OTP must fail
        $this->postJson('/api/v1/auth/verify-email', [
            'email' => 'jane@example.com',
            'otp_code' => $otp,
        ])->assertUnprocessable();
    }

    public function test_verification_succeeds_when_welcome_notification_delivery_fails(): void
    {
        $user = User::factory()->create([
            'email' => 'jane@example.com',
            'email_verified_at' => null,
        ]);

        $otp = $this->otpService->generate('jane@example.com', 'registration');

        $this->mock(Dispatcher::class, function (MockInterface $mock): void {
            $mock->shouldReceive('send')
                ->once()
                ->withArgs(function ($notifiables, $notification): bool {
                    return $notification instanceof WelcomeNotification;
                })
                ->andThrow(new \RuntimeException('SMTP transport failure'));
        });

        $response = $this->postJson('/api/v1/auth/verify-email', [
            'email' => 'jane@example.com',
            'otp_code' => $otp,
        ]);

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'message' => 'Email verified successfully. Welcome to The Factory!',
            ])
            ->assertJsonStructure([
                'data' => ['token', 'token_type', 'expires_in_days', 'user', 'onboarding_completed'],
            ]);

        $this->assertNotNull($user->fresh()->email_verified_at);
    }
}
