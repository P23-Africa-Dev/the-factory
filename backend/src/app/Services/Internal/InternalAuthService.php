<?php

declare(strict_types=1);

namespace App\Services\Internal;

use App\Exceptions\AccountAccessDeniedException;
use App\Models\User;
use App\Services\Security\SecurityAuditLogger;
use App\Support\UserAccountStatus;

class InternalAuthService
{
    public function __construct(
        private readonly SecurityAuditLogger $securityAudit,
    ) {}

    /**
     * @deprecated Use \App\Services\Agent\AgentAuthService for /api/v1/agent/login.
     *
     * Legacy internal login now accepts only agents for backward compatibility.
     */
    public function login(string $email, string $password): ?array
    {
        /** @var User|null $user */
        $user = User::query()->where('email', strtolower($email))->first();

        if (! $user) {
            $this->securityAudit->loginFailed(SecurityAuditLogger::CHANNEL_INTERNAL_API, null, $email, 'user_not_found');

            return null;
        }

        $block = UserAccountStatus::resolveBlock($user);
        if ($block !== null) {
            $this->securityAudit->loginFailed(SecurityAuditLogger::CHANNEL_INTERNAL_API, $user, $email, 'account_blocked');

            throw new AccountAccessDeniedException(
                message: $block['message'],
                accountStatus: $block['code'],
                suspendedUntil: $block['suspended_until'],
            );
        }

        if ($user->internal_role !== 'agent' || $user->onboarding_status !== 'active') {
            $this->securityAudit->loginFailed(SecurityAuditLogger::CHANNEL_INTERNAL_API, $user, $email, 'role_not_permitted');

            return null;
        }

        $hasCompanyContext = $user->companies()
            ->where('companies.status', 'active')
            ->wherePivot('role', 'agent')
            ->exists();

        if (! $hasCompanyContext) {
            $this->securityAudit->loginFailed(SecurityAuditLogger::CHANNEL_INTERNAL_API, $user, $email, 'no_company');

            return null;
        }

        if (! password_verify($password, (string) $user->password)) {
            $this->securityAudit->loginFailed(SecurityAuditLogger::CHANNEL_INTERNAL_API, $user, $email, 'invalid_password');

            return null;
        }

        $token = $user->createToken(
            name: 'agent_auth_token',
            abilities: ['*'],
            expiresAt: now()->addDays(30),
        );

        $this->securityAudit->loginSucceeded(SecurityAuditLogger::CHANNEL_INTERNAL_API, $user);

        return [
            'user' => $user,
            'token' => $token->plainTextToken,
            'internal_role' => $user->internal_role,
            'access_role' => 'agent',
        ];
    }

    /**
     * @deprecated Internal endpoint now supports agent role only.
     */
    public function isInternalUser(User $user): bool
    {
        return $user->internal_role === 'agent'
            && $user->canAuthenticate()
            && $user->companies()->where('companies.status', 'active')->wherePivot('role', 'agent')->exists();
    }
}
