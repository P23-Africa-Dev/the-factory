<?php

declare(strict_types=1);

namespace App\Services\Billing;

use App\Models\Company;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CompanySeatLimitService
{
    public function countMembers(Company $company): int
    {
        return (int) DB::table('company_users')
            ->where('company_id', $company->id)
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

    public function remainingSeats(Company $company): ?int
    {
        $limit = $this->seatLimit($company);

        if ($limit === null) {
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
            return;
        }

        if ($this->countMembers($company) >= $limit) {
            throw ValidationException::withMessages([
                'email' => ["Your plan allows up to {$limit} users. Upgrade to add more."],
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

        return [
            'used' => $used,
            'limit' => $limit,
            'remaining' => $limit === null ? null : max(0, $limit - $used),
        ];
    }
}
