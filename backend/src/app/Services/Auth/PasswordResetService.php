<?php

declare(strict_types=1);

namespace App\Services\Auth;

use App\Enums\NotificationCategory;
use App\Enums\NotificationPriority;
use App\Enums\VerificationType;
use App\Models\User;
use App\Notifications\OtpNotification;
use App\Services\Notification\NotificationService;
use Illuminate\Support\Facades\Log;
use Throwable;

class PasswordResetService
{
    public function __construct(
        private readonly OtpService $otpService,
        private readonly NotificationService $notificationService,
    ) {}

    public function sendResetCode(string $email, ?string $ipAddress = null): bool
    {
        /** @var User|null $user */
        $user = User::query()->where('email', strtolower($email))->first();

        if (! $user || ! $user->canAuthenticate()) {
            return true;
        }

        if ($this->otpService->isWithinCooldown($user->email, VerificationType::PASSWORD_RESET->value)) {
            return false;
        }

        $otp = $this->otpService->generate(
            email: $user->email,
            type: VerificationType::PASSWORD_RESET->value,
            ipAddress: $ipAddress,
        );

        try {
            $user->notify(new OtpNotification($otp, VerificationType::PASSWORD_RESET->value));

            $this->notificationService->notifyUser((int) $user->id, [
                'type' => 'auth.password_reset_otp_sent',
                'category' => NotificationCategory::AUTH->value,
                'title' => 'Password reset code sent',
                'message' => 'A password reset code was sent to your email.',
                'reference_type' => User::class,
                'reference_id' => (int) $user->id,
                'action_url' => '/auth/reset-password',
                'action_route' => 'auth.reset-password',
                'priority' => NotificationPriority::NORMAL->value,
                'created_by_user_id' => (int) $user->id,
                'metadata' => [
                    'verification_type' => VerificationType::PASSWORD_RESET->value,
                ],
                'dedupe_key' => 'auth-password-reset-otp:' . $user->id,
            ]);

            Log::info('OTP delivery succeeded for password reset.', [
                'email' => $user->email,
                'user_id' => $user->id,
                'verification_type' => VerificationType::PASSWORD_RESET->value,
                'ip' => $ipAddress,
            ]);
        } catch (Throwable $e) {
            $this->otpService->invalidateLatestUnused($user->email, VerificationType::PASSWORD_RESET->value);

            Log::error('OTP delivery failed for password reset.', [
                'email' => $user->email,
                'user_id' => $user->id,
                'verification_type' => VerificationType::PASSWORD_RESET->value,
                'ip' => $ipAddress,
                'exception' => $e::class,
                'message' => $e->getMessage(),
            ]);

            return false;
        }

        return true;
    }

    public function resetPassword(string $email, string $otp, string $password): bool
    {
        $verified = $this->otpService->verify(
            email: strtolower($email),
            otp: $otp,
            type: VerificationType::PASSWORD_RESET->value,
        );

        if (! $verified) {
            return false;
        }

        /** @var User|null $user */
        $user = User::query()->where('email', strtolower($email))->first();

        if (! $user) {
            return false;
        }

        $user->update([
            'password' => $password,
        ]);

        $this->notificationService->notifyUser((int) $user->id, [
            'type' => 'auth.password_reset_completed',
            'category' => NotificationCategory::AUTH->value,
            'title' => 'Password updated',
            'message' => 'Your password has been reset successfully.',
            'reference_type' => User::class,
            'reference_id' => (int) $user->id,
            'action_url' => '/auth/login',
            'action_route' => 'auth.login',
            'priority' => NotificationPriority::HIGH->value,
            'created_by_user_id' => (int) $user->id,
            'metadata' => [
                'verification_type' => VerificationType::PASSWORD_RESET->value,
            ],
            'dedupe_key' => 'auth-password-reset-completed:' . $user->id,
        ]);

        return true;
    }
}
