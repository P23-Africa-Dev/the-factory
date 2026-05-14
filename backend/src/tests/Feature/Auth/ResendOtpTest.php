<?php

declare(strict_types=1);

namespace Tests\Feature\Auth;

use App\Enums\VerificationType;
use App\Models\User;
use App\Services\Auth\OtpService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class ResendOtpTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_resend_otp_after_cooldown_period(): void
    {
        Notification::fake();

        User::factory()->create(['email' => 'jane@example.com']);

        /** @var OtpService $otpService */
        $otpService = app(OtpService::class);
        $otpService->generate('jane@example.com', VerificationType::REGISTRATION->value);

        // Simulate cooldown already passed
        DB::table('user_verifications')->update(['created_at' => now()->subSeconds(61)]);

        $response = $this->postJson('/api/v1/auth/resend-otp', [
            'email' => 'jane@example.com',
        ]);

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'message' => 'A new verification code has been sent to your email.',
            ])
            ->assertJsonStructure(['data' => ['email']]);

        $this->assertSame(2, DB::table('user_verifications')->where('email', 'jane@example.com')->count());
    }

    public function test_user_cannot_resend_otp_within_cooldown_period(): void
    {
        User::factory()->create(['email' => 'jane@example.com']);

        /** @var OtpService $otpService */
        $otpService = app(OtpService::class);
        $otpService->generate('jane@example.com', VerificationType::REGISTRATION->value);

        $response = $this->postJson('/api/v1/auth/resend-otp', [
            'email' => 'jane@example.com',
        ]);

        $response->assertStatus(429)
            ->assertJson(['success' => false])
            ->assertJsonStructure(['errors' => ['email']]);
    }

    public function test_resend_otp_fails_for_unknown_email(): void
    {
        $response = $this->postJson('/api/v1/auth/resend-otp', [
            'email' => 'unknown@example.com',
        ]);

        $response->assertUnprocessable()
            ->assertJsonStructure(['errors' => ['email']]);
    }
}
