<?php

declare(strict_types=1);

namespace App\Services\Auth;

use App\Exceptions\AccountAccessDeniedException;
use App\Models\User;
use App\Support\UserAccountStatus;

class AdminAuthService
{
    /**
     * Authenticate a user allowed on the shared admin endpoint.
     *
     * Allowed users:
     * - Self-serve users (internal_role = null, onboarding completed)
     * - Enterprise users (internal_role = null, enterprise onboarding completed)
     * - Admins (internal_role = admin, onboarding_status = active)
     * - Supervisors (internal_role = supervisor, onboarding_status = active)
     *
     * All accepted users must also have at least one active company membership.
     */
    public function login(string $email, string $password): ?array
    {
        /** @var User|null $user */
        $user = User::where('email', strtolower($email))->first();

        if (! $user) {
            return null;
        }

        $block = UserAccountStatus::resolveBlock($user);
        if ($block !== null) {
            throw new AccountAccessDeniedException(
                message: $block['message'],
                accountStatus: $block['code'],
                suspendedUntil: $block['suspended_until'],
            );
        }

        $isSupervisor = $user->internal_role === 'supervisor' && $user->onboarding_status === 'active';
        $isInternalAdmin = $user->internal_role === 'admin' && $user->onboarding_status === 'active';

        $hasSelfServeOnboarding = ! $user->internal_role && $user->hasCompletedOnboarding();
        $hasEnterpriseOnboarding = ! $user->internal_role && $user->hasCompletedEnterpriseOnboarding();

        if (! $isSupervisor && ! $isInternalAdmin && ! $hasSelfServeOnboarding && ! $hasEnterpriseOnboarding) {
            return null;
        }

        if (! $this->hasActiveCompanyMembership($user, $isSupervisor || $isInternalAdmin)) {
            return null;
        }

        if (! password_verify($password, (string) $user->password)) {
            return null;
        }

        $token = $user->createToken(
            name: 'admin_auth_token',
            abilities: ['*'],
            expiresAt: now()->addDays(30),
        );

        $userType = $isSupervisor
            ? 'supervisor'
            : ($isInternalAdmin
                ? 'admin'
                : ($hasSelfServeOnboarding ? 'self-serve' : 'enterprise'));

        return [
            'user' => $user,
            'token' => $token->plainTextToken,
            'user_type' => $userType,
            'access_role' => $isSupervisor ? 'supervisor' : 'admin',
            'internal_role' => $isSupervisor ? 'supervisor' : ($isInternalAdmin ? 'admin' : null),
        ];
    }

    /**
     * Validate whether a user can authenticate via /auth/login.
     */
    public function canUseSharedAuthEntryPoint(User $user): bool
    {
        if (! $user->canAuthenticate()) {
            return false;
        }

        if ($user->internal_role === 'supervisor') {
            return $user->onboarding_status === 'active' && $this->hasActiveCompanyMembership($user, true);
        }

        if ($user->internal_role === 'admin') {
            return $user->onboarding_status === 'active' && $this->hasActiveCompanyMembership($user, true);
        }

        return ! $user->internal_role
            && ($user->hasCompletedOnboarding() || $user->hasCompletedEnterpriseOnboarding())
            && $this->hasActiveCompanyMembership($user, false);
    }

    private function hasActiveCompanyMembership(User $user, bool $isInternalManager): bool
    {
        $allowedRoles = $isInternalManager
            ? ['owner', 'admin', 'supervisor']
            : ['owner', 'admin'];

        return $user->companies()
            ->where('companies.status', 'active')
            ->wherePivotIn('role', $allowedRoles)
            ->exists();
    }
}
