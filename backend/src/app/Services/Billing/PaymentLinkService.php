<?php

declare(strict_types=1);

namespace App\Services\Billing;

use App\Enums\BillingInterval;
use App\Models\Company;
use App\Models\User;
use App\Notifications\PaymentLinkNotification;
use App\Support\Billing\BillingPlanCatalog;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class PaymentLinkService
{
    public function __construct(
        private readonly CompanySubscriptionService $subscriptionService,
    ) {}

    /**
     * @return array{url: string, token: string, expires_at: string}
     */
    public function generate(
        Company $company,
        ?string $planKey = null,
        ?BillingInterval $interval = null,
        bool $sendEmail = false,
        ?User $recipient = null,
    ): array {
        $planKey = $planKey ?? $company->assigned_plan_key;
        $interval = $interval ?? BillingInterval::tryFrom((string) $company->assigned_billing_interval);

        if ($planKey === null || $planKey === '' || ! BillingPlanCatalog::has($planKey)) {
            throw ValidationException::withMessages([
                'plan_key' => ['A valid subscription plan must be selected to generate a payment link.'],
            ]);
        }

        if ($interval === null) {
            throw ValidationException::withMessages([
                'interval' => ['A billing interval must be selected to generate a payment link.'],
            ]);
        }

        $plainToken = Str::random(64);
        $expiresAt = now()->addHours((int) config('billing.payment_link_ttl_hours', 168));

        $company->forceFill([
            'assigned_plan_key' => $planKey,
            'assigned_billing_interval' => $interval->value,
            'payment_link_token_hash' => Hash::make($plainToken),
            'payment_link_expires_at' => $expiresAt,
        ])->save();

        $url = rtrim((string) config('billing.frontend_url'), '/') . '/pay/' . $plainToken;

        if ($sendEmail && $recipient !== null) {
            $recipient->notify(new PaymentLinkNotification(
                companyName: $company->name,
                paymentUrl: $url,
                planLabel: BillingPlanCatalog::get($planKey)['label'],
                interval: $interval,
            ));
        }

        return [
            'url' => $url,
            'token' => $plainToken,
            'expires_at' => $expiresAt->toIso8601String(),
        ];
    }

    public function resolveCompanyByToken(string $token): Company
    {
        $companies = Company::query()
            ->whereNotNull('payment_link_token_hash')
            ->where(function ($query): void {
                $query->whereNull('payment_link_expires_at')
                    ->orWhere('payment_link_expires_at', '>', now());
            })
            ->get();

        foreach ($companies as $company) {
            if (Hash::check($token, (string) $company->payment_link_token_hash)) {
                return $company;
            }
        }

        throw ValidationException::withMessages([
            'token' => ['This payment link is invalid or has expired.'],
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    public function publicPayload(string $token): array
    {
        $company = $this->resolveCompanyByToken($token);
        $planKey = (string) $company->assigned_plan_key;
        $interval = BillingInterval::tryFrom((string) $company->assigned_billing_interval) ?? BillingInterval::MONTHLY;
        $plan = BillingPlanCatalog::get($planKey);

        return [
            'company_name' => $company->name,
            'public_company_id' => $company->company_id,
            'plan_key' => $planKey,
            'plan_label' => $plan['label'],
            'billing_interval' => $interval->value,
            'amount_cents' => BillingPlanCatalog::amountCents($planKey, $interval),
            'amount_display' => BillingPlanCatalog::formatUsd(BillingPlanCatalog::amountCents($planKey, $interval)),
            'already_paid' => $company->hasPaidSubscription(),
            'expires_at' => $company->payment_link_expires_at?->toIso8601String(),
        ];
    }

    public function checkoutFromToken(string $token): string
    {
        $company = $this->resolveCompanyByToken($token);

        if ($company->hasPaidSubscription()) {
            throw ValidationException::withMessages([
                'token' => ['This company already has an active subscription.'],
            ]);
        }

        $planKey = (string) $company->assigned_plan_key;
        $interval = BillingInterval::tryFrom((string) $company->assigned_billing_interval) ?? BillingInterval::MONTHLY;

        $checkout = $this->subscriptionService->createCheckoutSessionForPaymentLink(
            $company,
            $planKey,
            $interval,
        );

        return $checkout->asStripeCheckoutSession()->url;
    }
}
