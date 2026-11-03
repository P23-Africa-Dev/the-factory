<?php

declare(strict_types=1);

namespace App\Services\Mobile;

use App\Exceptions\AccountAccessDeniedException;
use App\Models\User;
use App\Services\Security\SecurityAuditLogger;
use App\Support\MobileAgentSession;
use App\Support\UserAccountStatus;

class MobileAuthService
{
    public function __construct(
        private readonly SecurityAuditLogger $securityAudit,
    ) {}

    public function login(string $email, string $password): ?array
    {
        /** @var User|null $user */
        $user = User::query()->where('email', strtolower(trim($email)))->first();

        if (! $user) {
            $this->securityAudit->loginFailed(SecurityAuditLogger::CHANNEL_MOBILE_API, null, $email, 'user_not_found');

            return null;
        }

        $block = UserAccountStatus::resolveBlock($user);
        if ($block !== null) {
            $this->securityAudit->loginFailed(SecurityAuditLogger::CHANNEL_MOBILE_API, $user, $email, 'account_blocked');

            throw new AccountAccessDeniedException(
                message: $block['message'],
                accountStatus: $block['code'],
                suspendedUntil: $block['suspended_until'],
            );
        }

        if (! password_verify($password, (string) $user->password)) {
            $this->securityAudit->loginFailed(SecurityAuditLogger::CHANNEL_MOBILE_API, $user, $email, 'invalid_password');

            return null;
        }

        $isRealAgent = $user->internal_role === 'agent' && $user->onboarding_status === 'active';
        $hasAgentCompany = $isRealAgent && $this->hasAgentCompany($user);

        $isMobileManagement = $this->isEligibleMobileManagement($user);
        $hasManagementCompany = $isMobileManagement && $this->hasManagementCompany($user);

        if (! $hasAgentCompany && ! $hasManagementCompany) {
            $this->securityAudit->loginFailed(SecurityAuditLogger::CHANNEL_MOBILE_API, $user, $email, 'role_not_permitted');

            return null;
        }

        if ($hasAgentCompany) {
            $appMode = 'agent';
            $token = $user->createToken(
                name: 'agent_auth_token',
                abilities: ['*'],
                expiresAt: now()->addDays(30),
            );
            $userType = 'agent';
            $accessRole = 'agent';
            $homePath = '/';
            $companies = $this->loadCompaniesForUser($user, ['agent']);
        } else {
            $appMode = 'manager';
            $token = $user->createToken(
                name: 'mobile_manager_token',
                abilities: ['*'],
                expiresAt: now()->addDays(30),
            );

            $isSupervisor = $user->internal_role === 'supervisor' && $user->onboarding_status === 'active';
            $isInternalAdmin = $user->internal_role === 'admin' && $user->onboarding_status === 'active';
            $hasSelfServeOnboarding = ! $user->internal_role && $user->hasCompletedOnboarding();

            $userType = $isSupervisor
                ? 'supervisor'
                : ($isInternalAdmin
                    ? 'admin'
                    : ($hasSelfServeOnboarding ? 'self-serve' : 'enterprise'));

            $accessRole = $isSupervisor ? 'supervisor' : 'admin';
            $homePath = '/manager';
            $allowedRoles = ($isSupervisor || $isInternalAdmin)
                ? ['owner', 'admin', 'supervisor']
                : ['owner', 'admin'];
            $companies = $this->loadCompaniesForUser($user, $allowedRoles);
        }

        $this->securityAudit->loginSucceeded(SecurityAuditLogger::CHANNEL_MOBILE_API, $user, [
            'app_mode' => $appMode,
            'user_type' => $userType,
        ]);

        return [
            'user' => $user,
            'token' => $token->plainTextToken,
            'app_mode' => $appMode,
            'home_path' => $homePath,
            'user_type' => $userType,
            'access_role' => $accessRole,
            'internal_role' => $user->internal_role,
            'companies' => $companies,
        ];
    }

    public function resolveSession(User $user): array
    {
        if (MobileAgentSession::isCurrent($user)) {
            return [
                'user' => $user,
                'app_mode' => 'legacy_mobile_agent',
                'home_path' => '/login',
                'user_type' => 'legacy',
                'access_role' => 'agent',
                'internal_role' => $user->internal_role,
                'companies' => [],
            ];
        }

        $isRealAgent = $user->internal_role === 'agent' && $user->onboarding_status === 'active';
        $hasAgentCompany = $isRealAgent && $this->hasAgentCompany($user);

        $isMobileManagement = $this->isEligibleMobileManagement($user);
        $hasManagementCompany = $isMobileManagement && $this->hasManagementCompany($user);

        if ($hasAgentCompany) {
            $appMode = 'agent';
            $homePath = '/';
            $userType = 'agent';
            $accessRole = 'agent';
            $companies = $this->loadCompaniesForUser($user, ['agent']);
        } elseif ($hasManagementCompany) {
            $appMode = 'manager';
            $homePath = '/manager';
            $isSupervisor = $user->internal_role === 'supervisor' && $user->onboarding_status === 'active';
            $isInternalAdmin = $user->internal_role === 'admin' && $user->onboarding_status === 'active';
            $hasSelfServeOnboarding = ! $user->internal_role && $user->hasCompletedOnboarding();

            $userType = $isSupervisor
                ? 'supervisor'
                : ($isInternalAdmin
                    ? 'admin'
                    : ($hasSelfServeOnboarding ? 'self-serve' : 'enterprise'));

            $accessRole = $isSupervisor ? 'supervisor' : 'admin';
            $allowedRoles = ($isSupervisor || $isInternalAdmin)
                ? ['owner', 'admin', 'supervisor']
                : ['owner', 'admin'];
            $companies = $this->loadCompaniesForUser($user, $allowedRoles);
        } else {
            $appMode = 'unknown';
            $homePath = '/login';
            $userType = null;
            $accessRole = null;
            $companies = [];
        }

        return [
            'user' => $user,
            'app_mode' => $appMode,
            'home_path' => $homePath,
            'user_type' => $userType,
            'access_role' => $accessRole,
            'internal_role' => $user->internal_role,
            'companies' => $companies,
        ];
    }

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

    private function loadCompaniesForUser(User $user, array $allowedRoles): array
    {
        return $user->companies()
            ->where('companies.status', 'active')
            ->wherePivotIn('role', $allowedRoles)
            ->get(['companies.id', 'companies.company_id', 'companies.name', 'companies.status'])
            ->map(static fn($c) => [
                'id' => (int) $c->id,
                'company_id' => $c->company_id,
                'name' => $c->name,
                'role' => (string) $c->pivot->role,
            ])
            ->values()
            ->all();
    }
}

