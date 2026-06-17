<?php

namespace App\Services\Enterprise;

use App\Exceptions\AccountAccessDeniedException;
use App\Models\User;
use App\Support\UserAccountStatus;

class EnterpriseAuthService
{
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

        if (! $user->hasCompletedEnterpriseOnboarding()) {
            return null;
        }

        $hasCompanyContext = $user->companies()
            ->where('companies.status', 'active')
            ->wherePivotIn('role', ['owner', 'admin'])
            ->exists();

        if (! $hasCompanyContext) {
            return null;
        }

        if (! password_verify($password, (string) $user->password)) {
            return null;
        }

        $token = $user->createToken(
            name: 'enterprise_auth_token',
            abilities: ['*'],
            expiresAt: now()->addDays(30),
        );

        return [
            'user' => $user,
            'token' => $token->plainTextToken,
        ];
    }
}
