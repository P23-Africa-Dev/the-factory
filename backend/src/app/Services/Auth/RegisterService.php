<?php

namespace App\Services\Auth;

use App\Enums\NotificationCategory;
use App\Enums\NotificationPriority;
use App\Enums\VerificationType;
use App\Exceptions\OtpDeliveryException;
use App\Models\User;
use App\Notifications\OtpNotification;
use App\Notifications\WelcomeNotification;
use App\Services\Notification\NotificationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Throwable;

class RegisterService
{
    public function __construct(
        private readonly OtpService $otpService,
        private readonly NotificationService $notificationService,
    ) {}

    /**
     * Create (or retrieve) user and send an OTP verification code.
     */
    public function initiateRegistration(string $name, string $email, string $password, Request $request): void
    {
        $user = User::firstOrCreate(
            ['email' => $email],
            [
                'name' => $name,
                'password' => $password,
                'is_active' => true,
            ],
        );

        // Update name and password only for users still in pending onboarding state.
        $canUpdatePendingOnboardingUser = ! $user->isEmailVerified()
            && ! $user->hasCompletedOnboarding()
            && ! $user->hasCompletedEnterpriseOnboarding()
            && ! $user->hasCompletedInternalOnboarding();

        if (! $user->wasRecentlyCreated) {
            $updates = [];

            if ($canUpdatePendingOnboardingUser) {
                $updates['password'] = $password;

                if ($user->name !== $name) {
                    $updates['name'] = $name;
                }
            }

            if (! empty($updates)) {
                $user->update($updates);
            }
        }

        $otp = $this->otpService->generate(
            email: $email,
            type: VerificationType::REGISTRATION->value,
            ipAddress: $request->ip(),
        );

        try {
            $user->notify(new OtpNotification($otp, VerificationType::REGISTRATION->value));

            $this->notificationService->notifyUser((int) $user->id, [
                'type' => 'auth.registration_otp_sent',
                'category' => NotificationCategory::AUTH->value,
                'title' => 'Verification code sent',
                'message' => 'A verification code was sent to your email for account registration.',
                'reference_type' => User::class,
                'reference_id' => (int) $user->id,
                'action_url' => '/auth/verify-email',
                'action_route' => 'auth.verify-email',
                'priority' => NotificationPriority::NORMAL->value,
                'created_by_user_id' => (int) $user->id,
                'metadata' => [
                    'verification_type' => VerificationType::REGISTRATION->value,
                ],
                'dedupe_key' => 'auth-registration-otp:' . $user->id,
            ]);

            Log::info('OTP delivery succeeded for registration.', [
                'email' => $email,
                'user_id' => $user->id,
                'verification_type' => VerificationType::REGISTRATION->value,
                'ip' => $request->ip(),
            ]);
        } catch (Throwable $e) {
            $this->otpService->invalidateLatestUnused($email, VerificationType::REGISTRATION->value);

            Log::error('OTP delivery failed for registration.', [
                'email' => $email,
                'user_id' => $user->id,
                'verification_type' => VerificationType::REGISTRATION->value,
                'ip' => $request->ip(),
                'exception' => $e::class,
                'message' => $e->getMessage(),
            ]);

            throw new OtpDeliveryException(email: $email, previous: $e);
        }
    }

    /**
     * Verify OTP, mark email as verified, and issue a Sanctum bearer token.
     * Returns null when OTP is invalid or expired.
     *
     * @return array{user: User, token: string}|null
     */
    public function verifyAndAuthenticate(string $email, string $otp): ?array
    {
        Log::info('OTP verification attempt started.', [
            'email' => $email,
            'verification_type' => VerificationType::REGISTRATION->value,
        ]);

        $verified = $this->otpService->verify(
            email: $email,
            otp: $otp,
            type: VerificationType::REGISTRATION->value,
        );

        if (! $verified) {
            Log::warning('OTP verification failed: invalid or expired code.', [
                'email' => $email,
                'verification_type' => VerificationType::REGISTRATION->value,
            ]);

            return null;
        }

        /** @var User $user */
        $user = User::where('email', $email)->firstOrFail();

        $isFirstVerification = ! $user->email_verified_at;

        if ($isFirstVerification) {
            $user->update(['email_verified_at' => now()]);

            $this->notificationService->notifyUser((int) $user->id, [
                'type' => 'auth.registration_verified',
                'category' => NotificationCategory::AUTH->value,
                'title' => 'Email verified',
                'message' => 'Your email has been verified and your account is now active.',
                'reference_type' => User::class,
                'reference_id' => (int) $user->id,
                'action_url' => '/dashboard',
                'action_route' => 'dashboard.overview',
                'priority' => NotificationPriority::HIGH->value,
                'created_by_user_id' => (int) $user->id,
                'metadata' => [
                    'verification_type' => VerificationType::REGISTRATION->value,
                ],
                'dedupe_key' => 'auth-registration-verified:' . $user->id,
            ]);

            try {
                $user->notify(new WelcomeNotification);
            } catch (Throwable $e) {
                // Verification should not fail if the welcome message cannot be delivered.
                Log::error('Welcome notification delivery failed after successful OTP verification.', [
                    'email' => $email,
                    'user_id' => $user->id,
                    'verification_type' => VerificationType::REGISTRATION->value,
                    'exception' => $e::class,
                    'message' => $e->getMessage(),
                ]);
            }
        }

        $accessToken = $user->createToken(
            name: 'auth_token',
            abilities: ['*'],
            expiresAt: now()->addDays(30),
        );

        return [
            'user' => $user->fresh(),
            'token' => $accessToken->plainTextToken,
        ];
    }
}
