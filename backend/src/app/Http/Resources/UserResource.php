<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $activeCompany = $this->companies()
            ->where('companies.status', 'active')
            ->orderByPivot('joined_at', 'desc')
            ->orderBy('company_users.created_at', 'desc')
            ->first(['companies.id', 'companies.company_id', 'companies.name', 'companies.status']);

        $selfServeCompleted = $this->hasCompletedOnboarding();
        $enterpriseCompleted = $this->hasCompletedEnterpriseOnboarding();
        $internalCompleted = $this->hasCompletedInternalOnboarding();

        $userType = match (true) {
            $selfServeCompleted => 'self-serve',
            $enterpriseCompleted => 'enterprise',
            $internalCompleted => 'internal',
            default => null,
        };

        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'avatar' => $this->avatar,
            'email_verified' => $this->isEmailVerified(),
            'onboarding_completed' => $selfServeCompleted || $enterpriseCompleted || $internalCompleted,
            'onboarding_completed_at' => $this->onboarding_completed_at?->toIso8601String(),
            'enterprise_onboarding_completed' => $enterpriseCompleted,
            'enterprise_onboarding_completed_at' => $this->enterprise_onboarding_completed_at?->toIso8601String(),
            'user_type' => $userType,
            'active_company' => $activeCompany ? [
                'id' => $activeCompany->id,
                'company_id' => $activeCompany->company_id,
                'name' => $activeCompany->name,
                'status' => $activeCompany->status,
                'role' => $activeCompany->pivot?->role,
            ] : null,
            'created_at' => $this->created_at->toIso8601String(),
        ];
    }
}
