<?php

declare(strict_types=1);

namespace App\Services\Billing;

use App\Enums\CompanyUserRole;
use App\Enums\SubscriptionStatus;
use App\Models\Company;
use App\Models\User;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Stripe\Exception\ApiErrorException;
use Stripe\PaymentMethod;
use Stripe\SetupIntent;
use Throwable;

class BillingPaymentMethodService
{
    public function __construct(
        private readonly CompanySubscriptionService $subscriptionService,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function listForUser(User $user, ?int $companyId = null): array
    {
        $company = $this->resolveBillableCompany($user, $companyId);

        if (! $company->hasStripeId()) {
            return [
                'items' => [],
                'default_payment_method_id' => null,
                'requires_payment_method' => $this->requiresPaymentMethod($company),
            ];
        }

        return $this->listForCompany($company);
    }

    /**
     * @return array<string, mixed>
     */
    public function createSetupIntent(User $user, ?int $companyId = null): array
    {
        $company = $this->resolveBillableCompany($user, $companyId);
        $this->ensureStripeConfigured();

        if (! $company->hasStripeId()) {
            $company->createAsStripeCustomer();
        }

        try {
            /** @var SetupIntent $intent */
            $intent = $company->stripe()->setupIntents->create([
                'customer' => $company->stripe_id,
                'payment_method_types' => ['card'],
                'usage' => 'off_session',
                'metadata' => [
                    'company_id' => (string) $company->id,
                ],
            ]);
        } catch (ApiErrorException $exception) {
            Log::error('billing.setup_intent_failed', [
                'company_id' => $company->id,
                'message' => $exception->getMessage(),
            ]);

            throw ValidationException::withMessages([
                'billing' => ['Unable to start card setup. Please try again.'],
            ]);
        }

        return [
            'client_secret' => $intent->client_secret,
            'setup_intent_id' => $intent->id,
        ];
    }

    public function setDefault(User $user, string $paymentMethodId, ?int $companyId = null): array
    {
        $company = $this->resolveBillableCompany($user, $companyId);
        $this->assertPaymentMethodBelongsToCustomer($company, $paymentMethodId);

        $company->updateDefaultPaymentMethod($paymentMethodId);
        $this->syncDefaultPaymentMethodCache($company);

        return $this->listForCompany($company->fresh());
    }

    public function detach(User $user, string $paymentMethodId, ?int $companyId = null): array
    {
        $company = $this->resolveBillableCompany($user, $companyId);
        $snapshot = $this->listForCompany($company);
        $items = $snapshot['items'] ?? [];
        $defaultId = (string) ($snapshot['default_payment_method_id'] ?? '');

        if ($defaultId === $paymentMethodId) {
            throw ValidationException::withMessages([
                'payment_method_id' => ['The primary payment method cannot be deleted. Set another card as primary first.'],
            ]);
        }

        if ($this->requiresPaymentMethod($company) && count($items) <= 1) {
            throw ValidationException::withMessages([
                'payment_method_id' => ['At least one payment method is required while your subscription is active.'],
            ]);
        }

        $this->assertPaymentMethodBelongsToCustomer($company, $paymentMethodId);

        try {
            $company->stripe()->paymentMethods->detach($paymentMethodId);
        } catch (ApiErrorException $exception) {
            Log::error('billing.detach_payment_method_failed', [
                'company_id' => $company->id,
                'payment_method_id' => $paymentMethodId,
                'message' => $exception->getMessage(),
            ]);

            throw ValidationException::withMessages([
                'payment_method_id' => ['Unable to remove this payment method.'],
            ]);
        }

        return $this->listForCompany($company->fresh());
    }

    public function syncDefaultPaymentMethodCache(Company $company): void
    {
        if (! $company->hasStripeId()) {
            $company->forceFill([
                'pm_type' => null,
                'pm_last_four' => null,
                'pm_exp_month' => null,
                'pm_exp_year' => null,
            ])->save();

            return;
        }

        try {
            $customer = $company->asStripeCustomer();
            $defaultPaymentMethodId = (string) ($customer->invoice_settings->default_payment_method ?? '');

            if ($defaultPaymentMethodId === '') {
                $company->forceFill([
                    'pm_type' => null,
                    'pm_last_four' => null,
                    'pm_exp_month' => null,
                    'pm_exp_year' => null,
                ])->save();

                return;
            }

            /** @var PaymentMethod $paymentMethod */
            $paymentMethod = $company->stripe()->paymentMethods->retrieve($defaultPaymentMethodId);
            $card = $paymentMethod->card;

            $company->forceFill([
                'pm_type' => $paymentMethod->type,
                'pm_last_four' => $card?->last4,
                'pm_exp_month' => $card?->exp_month,
                'pm_exp_year' => $card?->exp_year,
            ])->save();
        } catch (Throwable $exception) {
            Log::warning('billing.sync_default_payment_method_failed', [
                'company_id' => $company->id,
                'message' => $exception->getMessage(),
            ]);
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function listForCompany(Company $company): array
    {
        if (! $company->hasStripeId()) {
            return [
                'items' => [],
                'default_payment_method_id' => null,
                'requires_payment_method' => $this->requiresPaymentMethod($company),
            ];
        }

        try {
            $customer = $company->asStripeCustomer();
            $defaultPaymentMethodId = (string) ($customer->invoice_settings->default_payment_method ?? '');
            $paymentMethods = $company->stripe()->paymentMethods->all([
                'customer' => $company->stripe_id,
                'type' => 'card',
            ]);

            $items = collect($paymentMethods->data)->map(function (PaymentMethod $method) use ($defaultPaymentMethodId): array {
                return [
                    'id' => $method->id,
                    'brand' => $method->card?->brand,
                    'last4' => $method->card?->last4,
                    'exp_month' => $method->card?->exp_month,
                    'exp_year' => $method->card?->exp_year,
                    'is_default' => $method->id === $defaultPaymentMethodId,
                ];
            })->values()->all();

            return [
                'items' => $items,
                'default_payment_method_id' => $defaultPaymentMethodId !== '' ? $defaultPaymentMethodId : null,
                'requires_payment_method' => $this->requiresPaymentMethod($company),
            ];
        } catch (Throwable $exception) {
            Log::warning('billing.list_payment_methods_failed', [
                'company_id' => $company->id,
                'message' => $exception->getMessage(),
            ]);

            return [
                'items' => [],
                'default_payment_method_id' => null,
                'requires_payment_method' => $this->requiresPaymentMethod($company),
            ];
        }
    }

    private function requiresPaymentMethod(Company $company): bool
    {
        return in_array($company->subscriptionStatusEnum(), [
            SubscriptionStatus::ACTIVE,
            SubscriptionStatus::PAST_DUE,
            SubscriptionStatus::GRACE,
        ], true);
    }

    private function assertPaymentMethodBelongsToCustomer(Company $company, string $paymentMethodId): void
    {
        if (! $company->hasStripeId()) {
            throw ValidationException::withMessages([
                'payment_method_id' => ['No billing profile exists for this company yet.'],
            ]);
        }

        try {
            /** @var PaymentMethod $paymentMethod */
            $paymentMethod = $company->stripe()->paymentMethods->retrieve($paymentMethodId);

            if ((string) ($paymentMethod->customer ?? '') !== (string) $company->stripe_id) {
                throw ValidationException::withMessages([
                    'payment_method_id' => ['This payment method does not belong to your company.'],
                ]);
            }
        } catch (ValidationException $exception) {
            throw $exception;
        } catch (Throwable) {
            throw ValidationException::withMessages([
                'payment_method_id' => ['Payment method not found.'],
            ]);
        }
    }

    private function resolveBillableCompany(User $user, ?int $companyId): Company
    {
        return $this->subscriptionService->billableCompanyForManagement($user, $companyId);
    }

    private function ensureStripeConfigured(): void
    {
        $this->subscriptionService->ensureStripeConfigured();
    }
}
