<?php

declare(strict_types=1);

namespace App\Services\Billing;

use App\Enums\BillingInterval;
use App\Enums\CompanyUserRole;
use App\Enums\SubscriptionStatus;
use App\Models\Company;
use App\Models\User;
use App\Support\Billing\BillingPlanCatalog;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Laravel\Cashier\Checkout;
use Stripe\Checkout\Session;
use Stripe\Subscription as StripeSubscription;
use Throwable;

class CompanySubscriptionService
{
    public function __construct(
        private readonly CompanySeatLimitService $seatLimitService,
        private readonly BillingEnforcementSettingService $billingEnforcement,
        private readonly MapCreditService $mapCredits,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function statusForUser(User $user, ?int $companyId = null): array
    {
        $company = $this->resolveBillableCompany($user, $companyId, requireBillingRole: false);
        $role = (string) $company->pivot?->role;
        $canManageBilling = in_array($role, [
            CompanyUserRole::OWNER->value,
            CompanyUserRole::ADMIN->value,
        ], true);

        return $this->statusPayload($company, $canManageBilling, $role !== '' ? $role : null);
    }

    /**
     * @return array<string, mixed>
     */
    public function statusPayload(Company $company, bool $canManageBilling = true, ?string $viewerRole = null): array
    {
        $usage = $this->seatLimitService->usage($company);
        $status = $company->subscriptionStatusEnum();

        return [
            'company_id' => $company->id,
            'company_name' => $company->name,
            'public_company_id' => $company->company_id,
            'billing_enforced' => $this->billingEnforcement->isEnabled(),
            'subscription_status' => $status->value,
            'has_active_subscription' => $company->hasEffectiveSubscriptionAccess(),
            'has_paid_subscription' => $company->hasPaidSubscription(),
            'is_demo' => $company->isDemo(),
            'plan_key' => $company->subscription_plan_key,
            'billing_interval' => $company->subscription_billing_interval,
            'assigned_plan_key' => $company->assigned_plan_key,
            'assigned_billing_interval' => $company->assigned_billing_interval,
            'can_choose_plan' => $company->canChoosePlan(),
            'can_manage_billing' => $canManageBilling,
            'viewer_role' => $viewerRole,
            'has_stripe_customer' => $company->hasStripeId(),
            'has_active_stripe_subscription' => $this->hasActiveCashierSubscription($company),
            'current_period_start' => $company->subscription_current_period_start?->toIso8601String(),
            'current_period_end' => $company->subscription_current_period_end?->toIso8601String(),
            'grace_ends_at' => $company->subscription_grace_ends_at?->toIso8601String(),
            'seat_usage' => $usage,
            'payment_method' => [
                'type' => $company->pm_type,
                'last_four' => $company->pm_last_four,
                'exp_month' => $company->pm_exp_month,
                'exp_year' => $company->pm_exp_year,
            ],
            'map_credits' => $this->mapCredits->snapshot($company),
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
        $this->assertCheckoutContextAllowed($company, $context, $planKey);
        $this->ensureStripeConfigured();

        if (! $company->hasStripeId()) {
            $this->performStripeOperation($company, 'create_customer', function () use ($company): void {
                $company->createAsStripeCustomer();
            });
        }

        $priceId = BillingPlanCatalog::stripePriceId($planKey, $interval);

        if ($priceId === null) {
            throw ValidationException::withMessages([
                'plan_key' => ['This plan is not configured for checkout yet. Please contact support.'],
            ]);
        }

        $frontendUrl = rtrim((string) config('billing.frontend_url'), '/');
        $successUrl = $frontendUrl . '/billing/success?session_id={CHECKOUT_SESSION_ID}';
        $cancelUrl = match ($context) {
            'renewal' => $frontendUrl . '/subscribe?reason=expired',
            'upgrade' => $frontendUrl . '/billing/change-plan',
            default => $frontendUrl . '/subscribe',
        };

        /** @var Checkout $checkout */
        $checkout = $this->performStripeOperation($company, 'create_checkout_session', function () use ($company, $priceId, $successUrl, $cancelUrl, $planKey, $interval, $context, $user): Checkout {
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
        });

        return $checkout;
    }

    /**
     * Swap an existing Stripe subscription to a different plan (self-serve upgrade/downgrade).
     *
     * @return array<string, mixed>
     */
    public function changePlan(
        User $user,
        string $planKey,
        BillingInterval $interval,
        ?int $companyId = null,
    ): array {
        $company = $this->resolveBillableCompany($user, $companyId);
        $this->assertCanCheckout($company, $planKey, $interval);
        $this->seatLimitService->assertCanSwitchToPlan($company, $planKey);
        $this->ensureStripeConfigured();

        if (! $this->hasActiveCashierSubscription($company)) {
            throw ValidationException::withMessages([
                'plan_key' => [
                    'No active Stripe subscription found. Use checkout to start or convert your plan.',
                ],
            ]);
        }

        $priceId = BillingPlanCatalog::stripePriceId($planKey, $interval);

        if ($priceId === null) {
            throw ValidationException::withMessages([
                'plan_key' => ['This plan is not configured for billing yet. Please contact support.'],
            ]);
        }

        $previousPlanKey = $company->subscription_plan_key;

        $this->performStripeOperation($company, 'change_plan_swap', function () use ($company, $priceId): void {
            $company->subscription('default')->swap($priceId);
        });

        $company->refresh();

        $stripeSubscription = $company->subscription('default')?->asStripeSubscription();

        $company->forceFill([
            'subscription_plan_key' => $planKey,
            'subscription_billing_interval' => $interval->value,
            'subscription_status' => SubscriptionStatus::ACTIVE->value,
            'subscription_current_period_start' => isset($stripeSubscription?->current_period_start)
                ? now()->createFromTimestamp($stripeSubscription->current_period_start)
                : $company->subscription_current_period_start,
            'subscription_current_period_end' => isset($stripeSubscription?->current_period_end)
                ? now()->createFromTimestamp($stripeSubscription->current_period_end)
                : $company->subscription_current_period_end,
            'subscription_grace_ends_at' => null,
        ])->save();

        $fresh = $company->fresh();

        if ($previousPlanKey !== $planKey) {
            $this->mapCredits->resetPlanCredits($fresh, 'change_plan');
        } else {
            $this->mapCredits->ensureRecord($fresh);
        }

        return $this->statusPayload($fresh);
    }

    public function hasActiveCashierSubscription(Company $company): bool
    {
        try {
            return $company->subscribed('default');
        } catch (Throwable) {
            return false;
        }
    }

    public function createCheckoutSessionForPaymentLink(
        Company $company,
        string $planKey,
        BillingInterval $interval,
    ): Checkout {
        $this->assertCanCheckout($company, $planKey, $interval, allowLockedPlan: true);
        $this->ensureStripeConfigured();

        if (! $company->hasStripeId()) {
            $this->performStripeOperation($company, 'create_customer', function () use ($company): void {
                $company->createAsStripeCustomer();
            });
        }

        $priceId = BillingPlanCatalog::stripePriceId($planKey, $interval);

        if ($priceId === null) {
            throw ValidationException::withMessages([
                'plan_key' => ['This plan is not configured for checkout yet.'],
            ]);
        }

        $frontendUrl = rtrim((string) config('billing.frontend_url'), '/');

        /** @var Checkout $checkout */
        $checkout = $this->performStripeOperation($company, 'create_checkout_session', function () use ($company, $priceId, $frontendUrl, $planKey, $interval): Checkout {
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
        });

        return $checkout;
    }

    public function createCreditTopupCheckout(User $user, float $amountUsd, ?int $companyId = null): Checkout
    {
        $company = $this->resolveBillableCompany($user, $companyId);
        $this->ensureStripeConfigured();

        $amountCents = (int) round($amountUsd * 100);

        if ($amountCents < 100) {
            throw ValidationException::withMessages([
                'amount_usd' => ['The minimum top up amount is $1.'],
            ]);
        }

        if (! $company->hasStripeId()) {
            $this->performStripeOperation($company, 'create_customer', function () use ($company): void {
                $company->createAsStripeCustomer();
            });
        }

        $credits = $this->mapCredits->usdToCredits($amountUsd);
        $frontendUrl = rtrim((string) config('billing.frontend_url'), '/');

        /** @var Checkout $checkout */
        $checkout = $this->performStripeOperation($company, 'create_topup_checkout', function () use ($company, $amountCents, $credits, $amountUsd, $frontendUrl, $user): Checkout {
            return $company->checkoutCharge($amountCents, 'Map usage credits', 1, [
                'success_url' => $frontendUrl . '/billing/credit-success?session_id={CHECKOUT_SESSION_ID}',
                'cancel_url' => $frontendUrl . '/settings/map-credits',
                'metadata' => [
                    'type' => 'credit_topup',
                    'company_id' => (string) $company->id,
                    'credits' => (string) $credits,
                    'amount_usd' => (string) $amountUsd,
                    'user_id' => (string) $user->id,
                ],
            ]);
        });

        return $checkout;
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

    public function billableCompanyForManagement(User $user, ?int $companyId = null): Company
    {
        return $this->resolveBillableCompany($user, $companyId);
    }

    public function syncFromStripeSubscription(Company $company, StripeSubscription $stripeSubscription): void
    {
        $priceId = $stripeSubscription->items->data[0]->price->id ?? null;
        $planKey = $priceId ? BillingPlanCatalog::planKeyForStripePriceId($priceId) : null;
        $interval = $priceId ? BillingPlanCatalog::intervalForStripePriceId($priceId) : null;

        $previousPlanKey = $company->subscription_plan_key;

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

        if ($subscriptionStatus === SubscriptionStatus::ACTIVE) {
            $fresh = $company->fresh();

            // Plan change (upgrade/downgrade) => grant the new allocation immediately.
            if ($planKey !== null && $planKey !== $previousPlanKey) {
                $this->mapCredits->resetPlanCredits($fresh, 'webhook');
            } else {
                $this->mapCredits->ensureRecord($fresh);
            }
        }
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

        $this->mapCredits->allocateForActivation($company->fresh());
    }

    public function markPendingPayment(Company $company): void
    {
        if ($company->hasPaidSubscription()) {
            return;
        }

        $company->forceFill([
            'subscription_status' => SubscriptionStatus::PENDING_PAYMENT->value,
        ])->save();
    }

    /**
     * Mark a company as paid offline (no Stripe subscription). Period end is
     * derived from the payment start date and billing interval for renewal tracking.
     */
    public function activateOfflinePayment(
        Company $company,
        string $planKey,
        BillingInterval $interval,
        \Carbon\CarbonInterface $periodStart,
    ): void {
        if (! BillingPlanCatalog::has($planKey)) {
            throw ValidationException::withMessages([
                'assigned_plan_key' => ['A valid subscription plan is required when marking as already paid.'],
            ]);
        }

        $start = $periodStart->copy()->startOfDay();
        $end = $interval === BillingInterval::ANNUAL
            ? $start->copy()->addYear()
            : $start->copy()->addMonth();

        $company->forceFill([
            'assigned_plan_key' => $planKey,
            'assigned_billing_interval' => $interval->value,
            'subscription_plan_key' => $planKey,
            'subscription_billing_interval' => $interval->value,
            'subscription_status' => SubscriptionStatus::ACTIVE->value,
            'subscription_current_period_start' => $start,
            'subscription_current_period_end' => $end,
            'subscription_grace_ends_at' => null,
            'payment_link_token_hash' => null,
            'payment_link_expires_at' => null,
        ])->save();

        $this->mapCredits->allocateForActivation($company->fresh());
    }

    private function resolveBillableCompany(User $user, ?int $companyId = null, bool $requireBillingRole = true): Company
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

        if ($requireBillingRole) {
            $role = (string) $company->pivot?->role;

            if (! in_array($role, [CompanyUserRole::OWNER->value, CompanyUserRole::ADMIN->value], true)) {
                throw ValidationException::withMessages([
                    'company_id' => ['Only company owners or admins can manage billing.'],
                ]);
            }
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
        $isLockedPlan = $lockedPlan !== null && $lockedPlan === $planKey;

        if (! BillingPlanCatalog::isActive($planKey) && ! $isLockedPlan) {
            throw ValidationException::withMessages([
                'plan_key' => ['The selected plan is not currently available.'],
            ]);
        }

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

    private function assertCheckoutContextAllowed(Company $company, string $context, string $planKey): void
    {
        if ($this->hasActiveCashierSubscription($company)) {
            throw ValidationException::withMessages([
                'plan_key' => [
                    'You already have an active Stripe subscription. Use Change plan to switch plans.',
                ],
            ]);
        }

        if ($context === 'upgrade') {
            $this->seatLimitService->assertCanSwitchToPlan($company, $planKey);

            return;
        }

        // onboarding / renewal: allow pending payment and expired renewals
    }

    public function ensureStripeConfigured(): void
    {
        $publishableKey = trim((string) config('cashier.key'));
        $secretKey = trim((string) config('cashier.secret'));

        if ($publishableKey === '' || $secretKey === '') {
            throw ValidationException::withMessages([
                'billing' => ['Billing is temporarily unavailable. Please contact support to complete your subscription.'],
            ]);
        }
    }

    /**
     * @template T
     *
     * @param  callable():T  $callback
     * @return T
     */
    private function performStripeOperation(Company $company, string $operation, callable $callback): mixed
    {
        try {
            return $callback();
        } catch (ValidationException $exception) {
            throw $exception;
        } catch (Throwable $exception) {
            Log::error('Stripe billing operation failed.', [
                'operation' => $operation,
                'company_id' => $company->id,
                'stripe_id' => $company->stripe_id,
                'exception' => $exception::class,
                'message' => $exception->getMessage(),
            ]);

            throw ValidationException::withMessages([
                'billing' => ['Unable to start secure checkout right now. Please try again shortly.'],
            ]);
        }
    }
}
