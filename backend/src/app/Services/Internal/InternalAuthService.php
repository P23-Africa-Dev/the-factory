<?php

declare(strict_types=1);

namespace App\Services\Internal;

use App\Models\User;

class InternalAuthService
{
    /**
     * @deprecated Use \App\Services\Agent\AgentAuthService for /api/v1/agent/login.
     *
     * Legacy internal login now accepts only agents for backward compatibility.
     */
    public function login(string $email, string $password): ?array
    {
        /** @var User|null $user */
        $user = User::query()->where('email', strtolower($email))->first();

        if (! $user || ! $user->canAuthenticate() || $user->internal_role !== 'agent' || $user->onboarding_status !== 'active') {
            return null;
        }

        $hasCompanyContext = $user->companies()
            ->where('companies.status', 'active')
            ->wherePivot('role', 'agent')
            ->exists();

        if (! $hasCompanyContext) {
            return null;
        }

        if (! password_verify($password, (string) $user->password)) {
            return null;
        }

        $token = $user->createToken(
            name: 'agent_auth_token',
            abilities: ['*'],
            expiresAt: now()->addDays(30),
        );

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
