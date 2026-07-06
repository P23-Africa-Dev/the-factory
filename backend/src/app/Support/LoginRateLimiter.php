<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;

class LoginRateLimiter
{
    public const EMAIL_IP_MAX_ATTEMPTS = 20;

    public const IP_MAX_ATTEMPTS = 120;

    public const DECAY_SECONDS = 60;

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
        return RateLimiter::tooManyAttempts(self::emailIpKey($request), self::EMAIL_IP_MAX_ATTEMPTS)
            || RateLimiter::tooManyAttempts(self::ipKey($request), self::IP_MAX_ATTEMPTS);
    }

    public static function availableIn(Request $request): int
    {
        $emailIpWait = RateLimiter::tooManyAttempts(self::emailIpKey($request), self::EMAIL_IP_MAX_ATTEMPTS)
            ? RateLimiter::availableIn(self::emailIpKey($request))
            : 0;

        $ipWait = RateLimiter::tooManyAttempts(self::ipKey($request), self::IP_MAX_ATTEMPTS)
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
