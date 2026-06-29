<?php

declare(strict_types=1);

namespace App\Services\Billing;

use App\Enums\BillingInterval;
use App\Enums\CompanyUserRole;
use App\Enums\SubscriptionStatus;
use App\Models\Company;
use App\Models\User;
use App\Support\Billing\BillingPlanCatalog;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Laravel\Cashier\Checkout;
use Stripe\Checkout\Session;
use Stripe\Subscription as StripeSubscription;

class CompanySubscriptionService
{
    public function __construct(
        private readonly CompanySeatLimitService $seatLimitService,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function statusForUser(User $user, ?int $companyId = null): array
    {
        $company = $this->resolveBillableCompany($user, $companyId);

        return $this->statusPayload($company);
    }

    /**
     * @return array<string, mixed>
     */
    public function statusPayload(Company $company): array
    {
        $usage = $this->seatLimitService->usage($company);
        $status = $company->subscriptionStatusEnum();

        return [
            'company_id' => $company->id,
            'company_name' => $company->name,
            'public_company_id' => $company->company_id,
            'subscription_status' => $status->value,
            'has_active_subscription' => $company->hasActiveSubscription(),
            'plan_key' => $company->subscription_plan_key,
            'billing_interval' => $company->subscription_billing_interval,
            'assigned_plan_key' => $company->assigned_plan_key,
            'assigned_billing_interval' => $company->assigned_billing_interval,
            'can_choose_plan' => $company->canChoosePlan(),
            'current_period_start' => $company->subscription_current_period_start?->toIso8601String(),
            'current_period_end' => $company->subscription_current_period_end?->toIso8601String(),
            'grace_ends_at' => $company->subscription_grace_ends_at?->toIso8601String(),
            'seat_usage' => $usage,
        ];
    }

    public function createCheckoutSession(
        User $user,
        string $planKey,
        BillingInterval $interval,
        string $context = 'onboarding',
        ?int $companyId = null,
    ): Checkout {
        $company = $this->resolveBillableCompany($user, $companyId);
        $this->assertCanCheckout($company, $planKey, $interval);

        if (! $company->hasStripeId()) {
            $company->createAsStripeCustomer();
        }

        $priceId = BillingPlanCatalog::stripePriceId($planKey, $interval);

        if ($priceId === null) {
            throw ValidationException::withMessages([
                'plan_key' => ['This plan is not configured for checkout yet. Please contact support.'],
            ]);
        }

        $frontendUrl = rtrim((string) config('billing.frontend_url'), '/');
        $successUrl = $frontendUrl . '/billing/success?session_id={CHECKOUT_SESSION_ID}';
        $cancelUrl = $context === 'renewal'
            ? $frontendUrl . '/subscribe?reason=expired'
            : $frontendUrl . '/subscribe';

        return $company
            ->newSubscription('default', $priceId)
            ->checkout([
                'success_url' => $successUrl,
                'cancel_url' => $cancelUrl,
                'metadata' => [
                    'company_id' => (string) $company->id,
                    'plan_key' => $planKey,
                    'billing_interval' => $interval->value,
                    'context' => $context,
                    'user_id' => (string) $user->id,
                ],
            ]);
    }

    public function createCheckoutSessionForPaymentLink(
        Company $company,
        string $planKey,
        BillingInterval $interval,
    ): Checkout {
        $this->assertCanCheckout($company, $planKey, $interval, allowLockedPlan: true);

        if (! $company->hasStripeId()) {
            $company->createAsStripeCustomer();
        }

        $priceId = BillingPlanCatalog::stripePriceId($planKey, $interval);

        if ($priceId === null) {
            throw ValidationException::withMessages([
                'plan_key' => ['This plan is not configured for checkout yet.'],
            ]);
        }

        $frontendUrl = rtrim((string) config('billing.frontend_url'), '/');

        return $company
            ->newSubscription('default', $priceId)
            ->checkout([
                'success_url' => $frontendUrl . '/billing/success?session_id={CHECKOUT_SESSION_ID}',
                'cancel_url' => $frontendUrl . '/pay/cancelled',
                'metadata' => [
                    'company_id' => (string) $company->id,
                    'plan_key' => $planKey,
                    'billing_interval' => $interval->value,
                    'context' => 'payment_link',
                ],
            ]);
    }

    public function createPortalSession(User $user, ?int $companyId = null): string
    {
        $company = $this->resolveBillableCompany($user, $companyId);

        if (! $company->hasStripeId()) {
            throw ValidationException::withMessages([
                'billing' => ['No billing profile exists for this company yet.'],
            ]);
        }

        $frontendUrl = rtrim((string) config('billing.frontend_url'), '/');

        return $company->billingPortalUrl($frontendUrl . '/dashboard');
    }

    public function syncFromStripeSubscription(Company $company, StripeSubscription $stripeSubscription): void
    {
        $priceId = $stripeSubscription->items->data[0]->price->id ?? null;
        $planKey = $priceId ? BillingPlanCatalog::planKeyForStripePriceId($priceId) : null;
        $interval = $priceId ? BillingPlanCatalog::intervalForStripePriceId($priceId) : null;

        $stripeStatus = (string) $stripeSubscription->status;
        $subscriptionStatus = match ($stripeStatus) {
            'active', 'trialing' => SubscriptionStatus::ACTIVE,
            'past_due', 'unpaid' => SubscriptionStatus::PAST_DUE,
            'canceled', 'incomplete_expired' => SubscriptionStatus::SUSPENDED,
            default => $company->subscriptionStatusEnum(),
        };

        $company->forceFill([
            'subscription_plan_key' => $planKey ?? $company->subscription_plan_key,
            'subscription_billing_interval' => $interval?->value ?? $company->subscription_billing_interval,
            'subscription_status' => $subscriptionStatus->value,
            'subscription_current_period_start' => isset($stripeSubscription->current_period_start)
                ? now()->createFromTimestamp($stripeSubscription->current_period_start)
                : $company->subscription_current_period_start,
            'subscription_current_period_end' => isset($stripeSubscription->current_period_end)
                ? now()->createFromTimestamp($stripeSubscription->current_period_end)
                : $company->subscription_current_period_end,
            'subscription_grace_ends_at' => $subscriptionStatus === SubscriptionStatus::ACTIVE
                ? null
                : $company->subscription_grace_ends_at,
        ])->save();
    }

    public function activateFromCheckoutSession(Company $company, Session $session): void
    {
        $planKey = (string) ($session->metadata['plan_key'] ?? $company->assigned_plan_key ?? '');
        $interval = BillingInterval::tryFrom((string) ($session->metadata['billing_interval'] ?? ''))
            ?? $company->lockedBillingInterval()
            ?? BillingInterval::MONTHLY;

        if ($planKey === '' || ! BillingPlanCatalog::has($planKey)) {
            $subscriptionId = (string) ($session->subscription ?? '');

            if ($subscriptionId !== '') {
                $stripeSubscription = $company->stripe()->subscriptions->retrieve($subscriptionId);
                $priceId = $stripeSubscription->items->data[0]->price->id ?? null;
                $planKey = $priceId ? (BillingPlanCatalog::planKeyForStripePriceId($priceId) ?? '') : '';
                $interval = $priceId
                    ? (BillingPlanCatalog::intervalForStripePriceId($priceId) ?? $interval)
                    : $interval;
            }
        }

        $periodEnd = null;
        $periodStart = null;

        if ($session->subscription) {
            $stripeSubscription = $company->stripe()->subscriptions->retrieve((string) $session->subscription);

            if (isset($stripeSubscription->current_period_start)) {
                $periodStart = now()->createFromTimestamp($stripeSubscription->current_period_start);
            }

            if (isset($stripeSubscription->current_period_end)) {
                $periodEnd = now()->createFromTimestamp($stripeSubscription->current_period_end);
            }
        }

        $company->forceFill([
            'subscription_plan_key' => $planKey !== '' ? $planKey : $company->subscription_plan_key,
            'subscription_billing_interval' => $interval->value,
            'subscription_status' => SubscriptionStatus::ACTIVE->value,
            'subscription_current_period_start' => $periodStart,
            'subscription_current_period_end' => $periodEnd,
            'subscription_grace_ends_at' => null,
            'payment_link_token_hash' => null,
            'payment_link_expires_at' => null,
        ])->save();
    }

    public function markPendingPayment(Company $company): void
    {
        if ($company->hasActiveSubscription()) {
            return;
        }

        $company->forceFill([
            'subscription_status' => SubscriptionStatus::PENDING_PAYMENT->value,
        ])->save();
    }

    private function resolveBillableCompany(User $user, ?int $companyId = null): Company
    {
        $query = $user->companies()->where('companies.status', 'active');

        if ($companyId !== null) {
            $company = (clone $query)->where('companies.id', $companyId)->first();
        } else {
            $company = $query
                ->orderByPivot('joined_at', 'desc')
                ->orderByPivot('company_users.created_at', 'desc')
                ->first();
        }

        if (! $company) {
            throw ValidationException::withMessages([
                'company_id' => ['You are not attached to any company context.'],
            ]);
        }

        $role = (string) $company->pivot?->role;

        if (! in_array($role, [CompanyUserRole::OWNER->value, CompanyUserRole::ADMIN->value], true)) {
            throw ValidationException::withMessages([
                'company_id' => ['Only company owners or admins can manage billing.'],
            ]);
        }

        return $company;
    }

    private function assertCanCheckout(
        Company $company,
        string $planKey,
        BillingInterval $interval,
        bool $allowLockedPlan = false,
    ): void {
        if (! BillingPlanCatalog::has($planKey)) {
            throw ValidationException::withMessages([
                'plan_key' => ['The selected plan is invalid.'],
            ]);
        }

        $lockedPlan = $company->lockedPlanKey();

        if ($lockedPlan !== null && $lockedPlan !== $planKey && ! $allowLockedPlan) {
            throw ValidationException::withMessages([
                'plan_key' => ['Your account is assigned to a specific plan. Please select the assigned plan.'],
            ]);
        }

        $lockedInterval = $company->lockedBillingInterval();

        if ($lockedInterval !== null && $lockedInterval !== $interval && ! $allowLockedPlan) {
            throw ValidationException::withMessages([
                'interval' => ['Your account is assigned to a specific billing interval.'],
            ]);
        }
    }
}
