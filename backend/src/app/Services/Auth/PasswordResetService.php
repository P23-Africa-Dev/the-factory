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

    /**
     * Tokens are stored hashed in MySQL `password_reset_tokens` via Laravel's users broker.
     */
    public function sendResetLink(string $email, ?string $portal = null, ?string $ipAddress = null): bool
    {
        $normalizedEmail = strtolower(trim($email));

        /** @var User|null $user */
        $user = User::query()->where('email', $normalizedEmail)->first();

        if (! $user || ! $user->canAuthenticate()) {
            if ($user !== null) {
                Log::info('Password reset skipped for ineligible account.', [
                    'email' => $normalizedEmail,
                    'user_id' => $user->id,
                    'ip' => $ipAddress,
                ]);
            }

            return true;
        }

        $effectivePortal = $this->resolveRequestedPortal($portal, $user);

        /** @var \Illuminate\Auth\Passwords\PasswordBroker $broker */
        $broker = Password::broker('users');
        $token = $broker->createToken($user);

        $frontendBaseUrl = $this->resolveFrontendBaseUrl();
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
                'action_url' => $this->loginPathForPortal($effectivePortal),
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
                'reset_url_host' => parse_url($resetUrl, PHP_URL_HOST),
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

        if (! $user || ! $user->canAuthenticate()) {
            return false;
        }

        /** @var \Illuminate\Auth\Passwords\PasswordBroker $broker */
        $broker = Password::broker('users');

        return $broker->tokenExists($user, $token);
    }

    /**
     * @return string|null Effective portal on success, null when reset failed.
     */
    public function resetPassword(string $email, string $token, string $password, ?string $portal = null): ?string
    {
        $normalizedEmail = strtolower(trim($email));

        /** @var User|null $user */
        $user = User::query()->where('email', $normalizedEmail)->first();

        if (! $user || ! $user->canAuthenticate()) {
            return null;
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
            return null;
        }

        $effectivePortal = $this->resolveRequestedPortal($portal, $user);

        $this->notificationService->notifyUser((int) $user->id, [
            'type' => 'auth.password_reset_completed',
            'category' => NotificationCategory::AUTH->value,
            'title' => 'Password updated',
            'message' => 'Your password has been reset successfully.',
            'reference_type' => User::class,
            'reference_id' => (int) $user->id,
            'action_url' => $this->loginPathForPortal($effectivePortal),
            'action_route' => 'auth.login',
            'priority' => NotificationPriority::HIGH->value,
            'created_by_user_id' => (int) $user->id,
            'metadata' => [
                'portal' => $effectivePortal,
            ],
            'dedupe_key' => 'auth-password-reset-completed:' . $user->id,
        ]);

        return $effectivePortal;
    }

    public function loginPathForPortal(string $portal): string
    {
        return $portal === 'agent' ? '/agent/login' : '/login';
    }

    private function resolveRequestedPortal(?string $portal, User $user): string
    {
        $normalizedPortal = strtolower(trim((string) $portal));

        if (in_array($normalizedPortal, ['agent', 'management'], true)) {
            return $normalizedPortal;
        }

        return $this->resolvePortalFromUser($user);
    }

    private function resolvePortalFromUser(User $user): string
    {
        return $user->internal_role === 'agent' ? 'agent' : 'management';
    }

    private function resolveFrontendBaseUrl(): string
    {
        return rtrim((string) config('app.frontend_url'), '/');
    }
}
