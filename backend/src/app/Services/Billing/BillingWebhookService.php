<?php

declare(strict_types=1);

namespace App\Services\Billing;

use App\Enums\SubscriptionStatus;
use App\Models\Company;
use App\Notifications\SubscriptionSuspendedNotification;
use Illuminate\Support\Facades\Log;
use Laravel\Cashier\Events\WebhookReceived;
use Stripe\Checkout\Session;
use Stripe\Subscription as StripeSubscription;

class BillingWebhookService
{
    public function __construct(
        private readonly CompanySubscriptionService $subscriptionService,
        private readonly BillingPaymentMethodService $paymentMethodService,
        private readonly MapCreditService $mapCredits,
    ) {}

    public function handle(WebhookReceived $event): void
    {
        $payload = $event->payload;
        $type = (string) ($payload['type'] ?? '');

        match ($type) {
            'checkout.session.completed' => $this->handleCheckoutCompleted($payload['data']['object'] ?? []),
            'customer.subscription.updated' => $this->handleSubscriptionUpdated($payload['data']['object'] ?? []),
            'customer.subscription.deleted' => $this->handleSubscriptionDeleted($payload['data']['object'] ?? []),
            'invoice.payment_succeeded' => $this->handleInvoicePaymentSucceeded($payload['data']['object'] ?? []),
            'invoice.payment_failed' => $this->handlePaymentFailed($payload['data']['object'] ?? []),
            'customer.updated' => $this->handleCustomerUpdated($payload['data']['object'] ?? []),
            'payment_method.attached' => $this->handlePaymentMethodChanged($payload['data']['object'] ?? []),
            'payment_method.detached' => $this->handlePaymentMethodChanged($payload['data']['object'] ?? []),
            default => null,
        };
    }

    /**
     * @param  array<string, mixed>  $object
     */
    private function handleCheckoutCompleted(array $object): void
    {
        $session = Session::constructFrom($object);

        // One-off credit top-up (Checkout mode=payment) rather than a subscription.
        $metadataType = (string) ($session->metadata['type'] ?? '');
        if (($session->mode ?? '') === 'payment' || $metadataType === 'credit_topup') {
            $this->handleCreditTopupCompleted($session);

            return;
        }

        $company = $this->resolveCompanyFromSession($session);

        if (! $company) {
            return;
        }

        $this->subscriptionService->activateFromCheckoutSession($company, $session);
        $this->paymentMethodService->syncDefaultPaymentMethodCache($company->fresh());
    }

    private function handleCreditTopupCompleted(Session $session): void
    {
        if (($session->payment_status ?? '') !== 'paid') {
            return;
        }

        $company = $this->resolveCompanyFromSession($session);

        if (! $company) {
            return;
        }

        $credits = (float) ($session->metadata['credits'] ?? 0);

        if ($credits <= 0) {
            return;
        }

        $this->mapCredits->addTopup($company, $credits, [
            'checkout_session_id' => (string) ($session->id ?? ''),
            'amount_usd' => isset($session->metadata['amount_usd']) ? (float) $session->metadata['amount_usd'] : null,
        ], 'webhook');
    }

    /**
     * @param  array<string, mixed>  $object
     */
    private function handleInvoicePaymentSucceeded(array $object): void
    {
        // Only recurring renewals refresh the plan credit allowance; the first
        // invoice (subscription_create) is already handled at activation.
        $subscriptionId = (string) ($object['subscription'] ?? '');
        $billingReason = (string) ($object['billing_reason'] ?? '');

        if ($subscriptionId === '' || ! in_array($billingReason, ['subscription_cycle', 'subscription_update'], true)) {
            return;
        }

        $company = $this->resolveCompanyFromStripeCustomer((string) ($object['customer'] ?? ''));

        if (! $company || ! $company->hasPaidSubscription()) {
            return;
        }

        $this->mapCredits->resetPlanCredits($company, 'webhook');
    }

    /**
     * @param  array<string, mixed>  $object
     */
    private function handleSubscriptionUpdated(array $object): void
    {
        $stripeSubscription = StripeSubscription::constructFrom($object);
        $company = $this->resolveCompanyFromStripeCustomer((string) ($stripeSubscription->customer ?? ''));

        if (! $company) {
            return;
        }

        $this->subscriptionService->syncFromStripeSubscription($company, $stripeSubscription);
    }

    /**
     * @param  array<string, mixed>  $object
     */
    private function handleSubscriptionDeleted(array $object): void
    {
        $stripeSubscription = StripeSubscription::constructFrom($object);
        $company = $this->resolveCompanyFromStripeCustomer((string) ($stripeSubscription->customer ?? ''));

        if (! $company) {
            return;
        }

        $graceEndsAt = now()->addDays((int) config('billing.grace_period_days', 7));

        $company->forceFill([
            'subscription_status' => SubscriptionStatus::GRACE->value,
            'subscription_grace_ends_at' => $graceEndsAt,
        ])->save();
    }

    /**
     * @param  array<string, mixed>  $object
     */
    private function handlePaymentFailed(array $object): void
    {
        $customerId = (string) ($object['customer'] ?? '');
        $company = $this->resolveCompanyFromStripeCustomer($customerId);

        if (! $company) {
            return;
        }

        $graceEndsAt = $company->subscription_grace_ends_at ?? now()->addDays((int) config('billing.grace_period_days', 7));

        $company->forceFill([
            'subscription_status' => SubscriptionStatus::PAST_DUE->value,
            'subscription_grace_ends_at' => $graceEndsAt,
        ])->save();
    }

    private function resolveCompanyFromSession(Session $session): ?Company
    {
        $companyId = $session->metadata['company_id'] ?? null;

        if ($companyId) {
            return Company::query()->find((int) $companyId);
        }

        return $this->resolveCompanyFromStripeCustomer((string) ($session->customer ?? ''));
    }

    private function resolveCompanyFromStripeCustomer(string $customerId): ?Company
    {
        if ($customerId === '') {
            return null;
        }

        return Company::query()->where('stripe_id', $customerId)->first();
    }

    /**
     * @param  array<string, mixed>  $object
     */
    private function handleCustomerUpdated(array $object): void
    {
        $company = $this->resolveCompanyFromStripeCustomer((string) ($object['id'] ?? ''));

        if (! $company) {
            return;
        }

        $this->paymentMethodService->syncDefaultPaymentMethodCache($company);
    }

    /**
     * @param  array<string, mixed>  $object
     */
    private function handlePaymentMethodChanged(array $object): void
    {
        $company = $this->resolveCompanyFromStripeCustomer((string) ($object['customer'] ?? ''));

        if (! $company) {
            return;
        }

        $this->paymentMethodService->syncDefaultPaymentMethodCache($company);
    }
}
