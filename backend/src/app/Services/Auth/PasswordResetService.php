<?php

declare(strict_types=1);

namespace App\Services\Auth;

use App\Enums\NotificationCategory;
use App\Enums\NotificationPriority;
use App\Models\User;
use App\Notifications\PasswordResetLinkNotification;
use App\Services\Notification\NotificationService;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Throwable;

class PasswordResetService
{
    public function __construct(
        private readonly NotificationService $notificationService,
    ) {}

    public function sendResetLink(string $email, ?string $portal = null, ?string $ipAddress = null): bool
    {
        $normalizedEmail = strtolower(trim($email));

        /** @var User|null $user */
        $user = User::query()->where('email', $normalizedEmail)->first();

        if (! $user || ! $user->canAuthenticate() || ! $this->matchesPortal($user, $portal)) {
            return true;
        }

        $effectivePortal = $this->resolvePortal($user);

        /** @var \Illuminate\Auth\Passwords\PasswordBroker $broker */
        $broker = Password::broker('users');
        $token = $broker->createToken($user);

        $frontendBaseUrl = rtrim((string) env('FRONTEND_URL', config('app.url')), '/');
        $query = http_build_query([
            'email' => $user->email,
            'portal' => $effectivePortal,
        ], '', '&', PHP_QUERY_RFC3986);
        $resetUrl = $frontendBaseUrl . '/reset-password/' . urlencode($token) . '?' . $query;
        $expiresInMinutes = (int) config('auth.passwords.users.expire', 60);

        try {
            $user->notify(new PasswordResetLinkNotification(
                resetUrl: $resetUrl,
                expiresInMinutes: $expiresInMinutes,
            ));

            $this->notificationService->notifyUser((int) $user->id, [
                'type' => 'auth.password_reset_link_sent',
                'category' => NotificationCategory::AUTH->value,
                'title' => 'Password reset link sent',
                'message' => 'A password reset link was sent to your email.',
                'reference_type' => User::class,
                'reference_id' => (int) $user->id,
                'action_url' => $effectivePortal === 'agent' ? '/agent/login' : '/login',
                'action_route' => 'auth.reset-password',
                'priority' => NotificationPriority::NORMAL->value,
                'created_by_user_id' => (int) $user->id,
                'metadata' => [
                    'portal' => $effectivePortal,
                ],
                'dedupe_key' => 'auth-password-reset-link:' . $user->id,
            ]);

            Log::info('Password reset link delivery succeeded.', [
                'email' => $user->email,
                'user_id' => $user->id,
                'portal' => $effectivePortal,
                'ip' => $ipAddress,
            ]);
        } catch (Throwable $e) {
            Log::error('Password reset link delivery failed.', [
                'email' => $user->email,
                'user_id' => $user->id,
                'portal' => $effectivePortal,
                'ip' => $ipAddress,
                'exception' => $e::class,
                'message' => $e->getMessage(),
            ]);

            return false;
        }

        return true;
    }

    public function validateToken(string $email, string $token, ?string $portal = null): bool
    {
        $normalizedEmail = strtolower(trim($email));

        /** @var User|null $user */
        $user = User::query()->where('email', $normalizedEmail)->first();

        if (! $user || ! $user->canAuthenticate() || ! $this->matchesPortal($user, $portal)) {
            return false;
        }

        /** @var \Illuminate\Auth\Passwords\PasswordBroker $broker */
        $broker = Password::broker('users');

        return $broker->tokenExists($user, $token);
    }

    public function resetPassword(string $email, string $token, string $password, ?string $portal = null): bool
    {
        $normalizedEmail = strtolower(trim($email));

        /** @var User|null $user */
        $user = User::query()->where('email', $normalizedEmail)->first();

        if (! $user || ! $user->canAuthenticate() || ! $this->matchesPortal($user, $portal)) {
            return false;
        }

        /** @var \Illuminate\Auth\Passwords\PasswordBroker $broker */
        $broker = Password::broker('users');

        $status = $broker->reset([
            'email' => $normalizedEmail,
            'token' => $token,
            'password' => $password,
            'password_confirmation' => $password,
        ], function (User $user, string $password): void {
            $user->forceFill([
                'password' => $password,
                'remember_token' => Str::random(60),
            ])->save();

            $user->tokens()->delete();
        });

        if ($status !== Password::PASSWORD_RESET) {
            return false;
        }

        $effectivePortal = $this->resolvePortal($user);

        $this->notificationService->notifyUser((int) $user->id, [
            'type' => 'auth.password_reset_completed',
            'category' => NotificationCategory::AUTH->value,
            'title' => 'Password updated',
            'message' => 'Your password has been reset successfully.',
            'reference_type' => User::class,
            'reference_id' => (int) $user->id,
            'action_url' => $effectivePortal === 'agent' ? '/agent/login' : '/login',
            'action_route' => 'auth.login',
            'priority' => NotificationPriority::HIGH->value,
            'created_by_user_id' => (int) $user->id,
            'metadata' => [
                'portal' => $effectivePortal,
            ],
            'dedupe_key' => 'auth-password-reset-completed:' . $user->id,
        ]);

        return true;
    }

    private function matchesPortal(User $user, ?string $portal): bool
    {
        if ($portal === null || trim($portal) === '') {
            return true;
        }

        $normalizedPortal = strtolower(trim($portal));

        return match ($normalizedPortal) {
            'agent' => $user->internal_role === 'agent',
            'management' => $user->internal_role !== 'agent',
            default => false,
        };
    }

    private function resolvePortal(User $user): string
    {
        return $user->internal_role === 'agent' ? 'agent' : 'management';
    }
}
