<?php

declare(strict_types=1);

namespace App\Services\Auth;

use App\Exceptions\InvalidRoleAccessException;
use App\Models\User;

class RoleAwareAuthService
{
    /**
     * Determine which login entry point should be used.
     *
     * Returns:
     * - 'auth' for admin/supervisor users
     * - 'agent' for agent users
     * - null if user is null
     */
    public static function getUserAuthRole(?User $user): ?string
    {
        if (! $user) {
            return null;
        }

        return $user->internal_role === 'agent' ? 'agent' : 'auth';
    }

    /**
     * Validate role access for login entry points.
     */
    public static function validateRoleAccess(User $user, string $intendedEndpoint): void
    {
        $userRole = self::getUserAuthRole($user);

        if ($intendedEndpoint === 'auth' && $userRole === 'agent') {
            throw new InvalidRoleAccessException(
                'Agent users cannot log in via the shared auth endpoint. Use /api/agent/login instead.'
            );
        }

        if ($intendedEndpoint === 'agent' && $userRole === 'auth') {
            throw new InvalidRoleAccessException(
                'Admin and supervisor users cannot log in via the agent endpoint. Use /api/auth/login instead.'
            );
        }
    }

    public static function canAuthenticateAsAuthUser(User $user): bool
    {
        return $user->internal_role !== 'agent';
    }

    public static function canAuthenticateAsAgent(User $user): bool
    {
        return $user->internal_role === 'agent';
    }
}
