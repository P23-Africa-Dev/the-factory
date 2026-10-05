<?php

declare(strict_types=1);

namespace App\Services\Agent;

use App\Exceptions\AccountAccessDeniedException;
use App\Models\User;
use App\Services\Security\SecurityAuditLogger;
use App\Support\MobileAgentSession;
use App\Support\UserAccountStatus;

class AgentAuthService
{
    public function __construct(
        private readonly SecurityAuditLogger $securityAudit,
    ) {}

    /**
     * Authenticate an agent user.
     */
    public function login(string $email, string $password): ?array
    {
        /** @var User|null $user */
        $user = User::query()->where('email', strtolower($email))->first();

        if (! $user) {
            $this->securityAudit->loginFailed(SecurityAuditLogger::CHANNEL_AGENT_API, null, $email, 'user_not_found');

            return null;
        }

        $block = UserAccountStatus::resolveBlock($user);
        if ($block !== null) {
            $this->securityAudit->loginFailed(SecurityAuditLogger::CHANNEL_AGENT_API, $user, $email, 'account_blocked');

            throw new AccountAccessDeniedException(
                message: $block['message'],
                accountStatus: $block['code'],
                suspendedUntil: $block['suspended_until'],
            );
        }

        $isRealAgent = $user->internal_role === 'agent' && $user->onboarding_status === 'active';
        $isMobileManagement = $this->isEligibleMobileManagement($user);

        if (! $isRealAgent && ! $isMobileManagement) {
            $this->securityAudit->loginFailed(SecurityAuditLogger::CHANNEL_AGENT_API, $user, $email, 'role_not_permitted');

            return null;
        }

        $hasCompanyContext = $isRealAgent
            ? $this->hasAgentCompany($user)
            : $this->hasManagementCompany($user);

        if (! $hasCompanyContext) {
            $this->securityAudit->loginFailed(SecurityAuditLogger::CHANNEL_AGENT_API, $user, $email, 'no_company');

            return null;
        }

        if (! password_verify($password, (string) $user->password)) {
            $this->securityAudit->loginFailed(SecurityAuditLogger::CHANNEL_AGENT_API, $user, $email, 'invalid_password');

            return null;
        }

        $token = $user->createToken(
            name: 'agent_auth_token',
            abilities: $isRealAgent ? ['*'] : [MobileAgentSession::ABILITY],
            expiresAt: now()->addDays(30),
        );

        $this->securityAudit->loginSucceeded(SecurityAuditLogger::CHANNEL_AGENT_API, $user);

        return [
            'user' => $user,
            'token' => $token->plainTextToken,
            'internal_role' => $user->internal_role,
            'access_role' => 'agent',
        ];
    }

    /**
     * Same people the web admin login already accepts. On the phone they
     * receive an agent session, not a management session.
     */
    private function isEligibleMobileManagement(User $user): bool
    {
        $isSupervisor = $user->internal_role === 'supervisor' && $user->onboarding_status === 'active';
        $isInternalAdmin = $user->internal_role === 'admin' && $user->onboarding_status === 'active';
        $hasSelfServeOnboarding = ! $user->internal_role && $user->hasCompletedOnboarding();
        $hasEnterpriseOnboarding = ! $user->internal_role && $user->hasCompletedEnterpriseOnboarding();

        return $isSupervisor || $isInternalAdmin || $hasSelfServeOnboarding || $hasEnterpriseOnboarding;
    }

    private function hasAgentCompany(User $user): bool
    {
        return $user->companies()
            ->where('companies.status', 'active')
            ->wherePivot('role', 'agent')
            ->exists();
    }

    private function hasManagementCompany(User $user): bool
    {
        $isInternalManager = $user->internal_role === 'supervisor' || $user->internal_role === 'admin';
        $allowedRoles = $isInternalManager
            ? ['owner', 'admin', 'supervisor']
            : ['owner', 'admin'];

        return $user->companies()
            ->where('companies.status', 'active')
            ->wherePivotIn('role', $allowedRoles)
            ->exists();
    }
}
