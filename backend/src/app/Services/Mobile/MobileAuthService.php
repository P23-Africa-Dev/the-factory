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

        $classification = $this->classify($user);
        if ($classification === null) {
            $this->securityAudit->loginFailed(SecurityAuditLogger::CHANNEL_MOBILE_API, $user, $email, 'role_not_permitted');

            return null;
        }

        $token = $user->createToken(
            name: $classification['app_mode'] === 'manager' ? 'mobile_manager_token' : 'agent_auth_token',
            abilities: ['*'],
            expiresAt: now()->addDays(30),
        );

        $this->securityAudit->loginSucceeded(SecurityAuditLogger::CHANNEL_MOBILE_API, $user, [
            'app_mode' => $classification['app_mode'],
            'user_type' => $classification['user_type'],
        ]);

        return [
            'user' => $user,
            'token' => $token->plainTextToken,
            'app_mode' => $classification['app_mode'],
            'home_path' => $classification['home_path'],
            'user_type' => $classification['user_type'],
            'access_role' => $classification['access_role'],
            'internal_role' => $user->internal_role,
            'companies' => $classification['companies'],
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

        $classification = $this->classify($user);
        if ($classification === null) {
            return [
                'user' => $user,
                'app_mode' => 'unknown',
                'home_path' => '/login',
                'user_type' => null,
                'access_role' => null,
                'internal_role' => $user->internal_role,
                'companies' => [],
            ];
        }

        return [
            'user' => $user,
            'app_mode' => $classification['app_mode'],
            'home_path' => $classification['home_path'],
            'user_type' => $classification['user_type'],
            'access_role' => $classification['access_role'],
            'internal_role' => $user->internal_role,
            'companies' => $classification['companies'],
        ];
    }

    /**
     * Management membership wins. A person is never both an agent and a manager.
     *
     * @return array{app_mode: string, home_path: string, user_type: string, access_role: string, companies: array<int, array<string, mixed>>}|null
     */
    private function classify(User $user): ?array
    {
        if ($this->isEligibleMobileManagement($user) && $this->hasManagementCompany($user)) {
            return $this->managerClassification($user);
        }

        $isRealAgent = $user->internal_role === 'agent' && $user->onboarding_status === 'active';
        if ($isRealAgent && $this->hasAgentCompany($user)) {
            return [
                'app_mode' => 'agent',
                'home_path' => '/',
                'user_type' => 'agent',
                'access_role' => 'agent',
                'companies' => $this->loadCompaniesForUser($user, ['agent']),
            ];
        }

        return null;
    }

    /**
     * @return array{app_mode: string, home_path: string, user_type: string, access_role: string, companies: array<int, array<string, mixed>>}
     */
    private function managerClassification(User $user): array
    {
        $isSupervisor = $user->internal_role === 'supervisor' && $user->onboarding_status === 'active';
        $isInternalAdmin = $user->internal_role === 'admin' && $user->onboarding_status === 'active';
        $hasSelfServeOnboarding = ! $user->internal_role && $user->hasCompletedOnboarding();

        $userType = $isSupervisor
            ? 'supervisor'
            : ($isInternalAdmin
                ? 'admin'
                : ($hasSelfServeOnboarding ? 'self-serve' : 'enterprise'));

        $allowedRoles = ($isSupervisor || $isInternalAdmin)
            ? ['owner', 'admin', 'supervisor']
            : ['owner', 'admin'];
        $companies = $this->loadCompaniesForUser($user, $allowedRoles);

        return [
            'app_mode' => 'manager',
            'home_path' => '/manager',
            'user_type' => $userType,
            'access_role' => $this->accessRoleFromCompanies($companies),
            'companies' => $companies,
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $companies
     */
    private function accessRoleFromCompanies(array $companies): string
    {
        $roles = array_map(
            static fn (array $company): string => (string) ($company['role'] ?? ''),
            $companies,
        );

        foreach (['owner', 'admin', 'supervisor'] as $preferred) {
            if (in_array($preferred, $roles, true)) {
                return $preferred;
            }
        }

        return 'admin';
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

