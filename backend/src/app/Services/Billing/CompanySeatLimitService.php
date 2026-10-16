<?php

declare(strict_types=1);

namespace App\Services\Billing;

use App\Enums\SubscriptionStatus;
use App\Models\Company;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CompanySeatLimitService
{
    public function countMembers(Company $company): int
    {
        return (int) DB::table('company_users')
            ->join('users', 'users.id', '=', 'company_users.user_id')
            ->where('company_users.company_id', $company->id)
            ->whereNull('users.deleted_at')
            ->count();
    }

    public function seatLimit(Company $company): ?int
    {
        $planKey = $company->subscription_plan_key;

        if ($planKey === null || $planKey === '') {
            return null;
        }

        try {
            return \App\Support\Billing\BillingPlanCatalog::seatLimit($planKey);
        } catch (\InvalidArgumentException) {
            return null;
        }
    }

    /**
     * True when the company should have a concrete seat limit enforced (fail closed).
     */
    public function requiresConfiguredPlan(Company $company): bool
    {
        if ($company->isDemo()) {
            return false;
        }

        $status = $company->subscriptionStatusEnum();

        return $company->hasPaidSubscription()
            || $status === SubscriptionStatus::GRACE
            || $status === SubscriptionStatus::PAST_DUE;
    }

    public function remainingSeats(Company $company): ?int
    {
        $limit = $this->seatLimit($company);

        if ($limit === null) {
            if ($this->requiresConfiguredPlan($company)) {
                return 0;
            }

            return null;
        }

        return max(0, $limit - $this->countMembers($company));
    }

    public function assertCanAddMember(Company $company): void
    {
        if (! $company->hasEffectiveSubscriptionAccess()) {
            throw ValidationException::withMessages([
                'company_id' => ['An active subscription is required before adding team members.'],
            ]);
        }

        $limit = $this->seatLimit($company);

        if ($limit === null) {
            if ($this->requiresConfiguredPlan($company)) {
                throw ValidationException::withMessages([
                    'email' => ['Subscription plan is not configured. Contact support or upgrade your plan.'],
                ]);
            }

            return;
        }

        $used = $this->countMembers($company);

        if ($used >= $limit) {
            throw ValidationException::withMessages([
                'email' => ["Your plan allows up to {$limit} users. Upgrade your plan to add more."],
            ]);
        }
    }

    /**
     * Ensure a target plan can host the company's current members (for downgrades).
     */
    public function assertCanSwitchToPlan(Company $company, string $planKey): void
    {
        try {
            $limit = \App\Support\Billing\BillingPlanCatalog::seatLimit($planKey);
        } catch (\InvalidArgumentException) {
            throw ValidationException::withMessages([
                'plan_key' => ['The selected plan is invalid.'],
            ]);
        }

        $used = $this->countMembers($company);

        if ($used > $limit) {
            $excess = $used - $limit;

            throw ValidationException::withMessages([
                'plan_key' => [
                    "Remove {$excess} team member" . ($excess === 1 ? '' : 's')
                    . " before switching to a plan that allows {$limit} users.",
                ],
            ]);
        }
    }

    /**
     * @return array{used: int, limit: ?int, remaining: ?int}
     */
    public function usage(Company $company): array
    {
        $used = $this->countMembers($company);
        $limit = $this->seatLimit($company);

        if ($limit === null && $this->requiresConfiguredPlan($company)) {
            return [
                'used' => $used,
                'limit' => 0,
                'remaining' => 0,
            ];
        }

        return [
            'used' => $used,
            'limit' => $limit,
            'remaining' => $limit === null ? null : max(0, $limit - $used),
        ];
    }
}
