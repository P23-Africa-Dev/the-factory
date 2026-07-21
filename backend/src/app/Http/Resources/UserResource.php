<?php

namespace App\Http\Resources;

use App\Services\Billing\BillingEnforcementSettingService;
use App\Support\AvatarUrlResolver;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $companyQuery = $this->companies()->where('companies.status', 'active');
        $supportCompanyId = $request->attributes->get('support_company_id');
        $supportEffectiveRole = $request->attributes->get('support_effective_role');

        if (is_numeric($supportCompanyId)) {
            $companyQuery->where('companies.id', (int) $supportCompanyId);
        } else {
            $companyQuery
                ->orderByPivot('joined_at', 'desc')
                ->orderBy('company_users.created_at', 'desc');
        }

        $activeCompany = $companyQuery->first([
            'companies.id',
            'companies.company_id',
            'companies.name',
            'companies.status',
            'companies.is_demo',
            'companies.subscription_status',
            'companies.subscription_plan_key',
            'companies.assigned_plan_key',
        ]);

        $billingActive = $activeCompany?->hasEffectiveSubscriptionAccess() ?? false;
        $paidSubscription = $activeCompany?->hasPaidSubscription() ?? false;

        $selfServeCompleted = $this->hasCompletedOnboarding();
        $enterpriseCompleted = $this->hasCompletedEnterpriseOnboarding();
        $internalCompleted = $this->hasCompletedInternalOnboarding();

        $userType = match (true) {
            $selfServeCompleted => 'self-serve',
            $enterpriseCompleted => 'enterprise',
            $internalCompleted => 'internal',
            default => null,
        };

        $avatarUrl = AvatarUrlResolver::resolveOrDefault($this->avatar, $this->gender);
        $billingEnforced = app(BillingEnforcementSettingService::class)->isEnabled();

        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'avatar' => $avatarUrl,
            'avatar_key' => $this->avatar,
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
                'role' => is_string($supportEffectiveRole)
                    ? $supportEffectiveRole
                    : $activeCompany->pivot?->role,
                'subscription_status' => $activeCompany->subscription_status,
                'has_active_subscription' => $billingActive,
                'has_paid_subscription' => $paidSubscription,
                'is_demo' => $activeCompany->isDemo(),
                'billing_enforced' => $billingEnforced,
            ] : null,
            'billing' => $activeCompany ? [
                'subscription_status' => $activeCompany->subscription_status,
                'has_active_subscription' => $billingActive,
                'has_paid_subscription' => $paidSubscription,
                'assigned_plan_key' => $activeCompany->assigned_plan_key,
                'billing_enforced' => $billingEnforced,
            ] : null,
            'created_at' => $this->created_at->toIso8601String(),
        ];
    }
}
