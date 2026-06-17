<?php

declare(strict_types=1);

namespace App\Services\Agent;

use App\Exceptions\AccountAccessDeniedException;
use App\Models\User;
use App\Support\UserAccountStatus;

class AgentAuthService
{
    /**
     * Authenticate an agent user.
     */
    public function login(string $email, string $password): ?array
    {
        /** @var User|null $user */
        $user = User::query()->where('email', strtolower($email))->first();

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

        if ($user->internal_role !== 'agent' || $user->onboarding_status !== 'active') {
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
}
