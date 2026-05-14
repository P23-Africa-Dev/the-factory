<?php

namespace App\Services\Enterprise;

use App\Models\User;

class EnterpriseAuthService
{
    public function login(string $email, string $password): ?array
    {
        /** @var User|null $user */
        $user = User::where('email', strtolower($email))->first();

        if (! $user || ! $user->canAuthenticate() || ! $user->hasCompletedEnterpriseOnboarding()) {
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
