<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\User;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * A management user signed in through the mobile agent app.
 * Abilities must be exactly this list. A wildcard token is never a mobile session.
 */
final class MobileAgentSession
{
    public const ABILITY = 'mobile-agent';

    public static function isCurrent(?User $user = null): bool
    {
        $user ??= auth()->user();

        if (! $user instanceof User) {
            return false;
        }

        $token = $user->currentAccessToken();

        if (! $token instanceof PersonalAccessToken) {
            return false;
        }

        $abilities = $token->abilities;

        if (! is_array($abilities)) {
            return false;
        }

        return array_values($abilities) === [self::ABILITY];
    }
}
