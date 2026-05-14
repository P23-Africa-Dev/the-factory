<?php

namespace App\Services\Enterprise;

use App\Enums\CompanyUserRole;
use App\Enums\DemoRequestStatus;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class FirstTimeOnboardingService
{
    public function __construct(private readonly DemoRequestService $demoRequestService) {}

    public function verifyCompanyId(int $requestId, string $token, string $companyId): array
    {
        $demoRequest = $this->demoRequestService->resolveValidApprovedRequestForFirstTimeSetup($requestId, $token);

        if (! $demoRequest->company || strtoupper($companyId) !== strtoupper($demoRequest->company->company_id)) {
            throw ValidationException::withMessages([
                'company_id' => ['Company ID is invalid for this onboarding request.'],
            ]);
        }

        return [
            'request_id' => $demoRequest->id,
            'email' => $demoRequest->email,
            'company_name' => $demoRequest->company_name,
            'company_id' => $demoRequest->company->company_id,
        ];
    }

    public function completeSetup(int $requestId, string $token, string $companyId, string $password): array
    {
        $demoRequest = $this->demoRequestService->resolveValidApprovedRequestForFirstTimeSetup($requestId, $token);

        if (! $demoRequest->company || strtoupper($companyId) !== strtoupper($demoRequest->company->company_id)) {
            throw ValidationException::withMessages([
                'company_id' => ['Company ID is invalid for this onboarding request.'],
            ]);
        }

        return DB::transaction(function () use ($demoRequest, $password): array {
            $user = $demoRequest->user;
            $company = $demoRequest->company;

            if (! $user) {
                throw ValidationException::withMessages([
                    'request_id' => ['Associated user account was not found.'],
                ]);
            }

            if (! $company) {
                throw ValidationException::withMessages([
                    'company_id' => ['Associated company context is missing.'],
                ]);
            }

            $company->users()->syncWithoutDetaching([
                $user->id => [
                    'role' => CompanyUserRole::OWNER->value,
                    'joined_at' => now(),
                ],
            ]);

            $user->update([
                'password' => $password,
                'is_active' => true,
                'email_verified_at' => $user->email_verified_at ?? now(),
                'enterprise_onboarding_completed_at' => now(),
            ]);

            $demoRequest->update([
                'status' => DemoRequestStatus::ACTIVATED->value,
                'activated_at' => now(),
                'activation_token_hash' => null,
                'activation_link_expires_at' => null,
            ]);

            $token = $user->createToken(
                name: 'enterprise_auth_token',
                abilities: ['*'],
                expiresAt: now()->addDays(30),
            );

            return [
                'user' => $user->fresh(),
                'token' => $token->plainTextToken,
            ];
        });
    }
}
