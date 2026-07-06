<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;

class LoginRateLimiter
{
    public const DECAY_SECONDS = 60;

    public static function emailIpMaxAttempts(): int
    {
        return (int) config('rate_limits.login_email_ip_per_minute', 60);
    }

    public static function ipMaxAttempts(): int
    {
        return (int) config('rate_limits.login_ip_per_minute', 500);
    }

    public static function emailIpKey(Request $request): string
    {
        $email = strtolower(trim((string) $request->input('email', '')));

        return 'login:' . sha1($email . '|' . $request->ip());
    }

    public static function ipKey(Request $request): string
    {
        return 'login-ip:' . $request->ip();
    }

    public static function tooManyAttempts(Request $request): bool
    {
        return RateLimiter::tooManyAttempts(self::emailIpKey($request), self::emailIpMaxAttempts())
            || RateLimiter::tooManyAttempts(self::ipKey($request), self::ipMaxAttempts());
    }

    public static function availableIn(Request $request): int
    {
        $emailIpWait = RateLimiter::tooManyAttempts(self::emailIpKey($request), self::emailIpMaxAttempts())
            ? RateLimiter::availableIn(self::emailIpKey($request))
            : 0;

        $ipWait = RateLimiter::tooManyAttempts(self::ipKey($request), self::ipMaxAttempts())
            ? RateLimiter::availableIn(self::ipKey($request))
            : 0;

        return max($emailIpWait, $ipWait);
    }

    public static function recordFailedAttempt(Request $request): void
    {
        RateLimiter::hit(self::emailIpKey($request), self::DECAY_SECONDS);
        RateLimiter::hit(self::ipKey($request), self::DECAY_SECONDS);
    }

    public static function clear(Request $request): void
    {
        RateLimiter::clear(self::emailIpKey($request));
    }
}
