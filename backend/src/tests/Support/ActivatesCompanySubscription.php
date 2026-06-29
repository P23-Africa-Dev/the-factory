<?php

declare(strict_types=1);

namespace Tests\Support;

use App\Enums\BillingInterval;
use App\Enums\CompanyUserRole;
use App\Enums\SubscriptionStatus;
use App\Models\Company;
use App\Models\User;
use Illuminate\Support\Str;

trait ActivatesCompanySubscription
{
    protected function createCompanyWithOwner(array $companyAttributes = [], array $userAttributes = []): array
    {
        $user = User::factory()->create(array_merge([
            'onboarding_completed_at' => now(),
        ], $userAttributes));

        $company = Company::query()->create(array_merge([
            'company_id' => 'FAC-' . strtoupper(Str::random(8)),
            'name' => 'Test Company',
            'country' => 'NG',
            'team_size' => '2-10',
            'use_case' => 'startup',
            'status' => 'active',
            'activated_at' => now(),
            'subscription_status' => SubscriptionStatus::PENDING_PAYMENT->value,
        ], $companyAttributes));

        $company->users()->attach($user->id, [
            'role' => CompanyUserRole::OWNER->value,
            'joined_at' => now(),
        ]);

        return compact('user', 'company');
    }

    protected function activateCompanySubscription(Company $company, string $planKey = 'up_to_5'): Company
    {
        $company->forceFill([
            'subscription_status' => SubscriptionStatus::ACTIVE->value,
            'subscription_plan_key' => $planKey,
            'subscription_billing_interval' => BillingInterval::MONTHLY->value,
            'subscription_current_period_start' => now(),
            'subscription_current_period_end' => now()->addMonth(),
        ])->save();

        return $company->fresh();
    }

    protected function ownerToken(User $user): string
    {
        return $user->createToken('test-token', ['*'])->plainTextToken;
    }

    protected function withBillingEnforcement(): void
    {
        config(['billing.enforce_in_tests' => true]);
    }
}
