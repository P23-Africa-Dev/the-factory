<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Billing;

use App\Enums\BillingInterval;
use App\Http\Controllers\Controller;
use App\Http\Requests\Billing\CreateCheckoutRequest;
use App\Services\Billing\CompanySubscriptionService;
use Illuminate\Http\JsonResponse;

class BillingCheckoutController extends Controller
{
    public function __construct(private readonly CompanySubscriptionService $service) {}

    public function __invoke(CreateCheckoutRequest $request): JsonResponse
    {
        $checkout = $this->service->createCheckoutSession(
            user: $request->user(),
            planKey: (string) $request->validated('plan_key'),
            interval: BillingInterval::from((string) $request->validated('interval')),
            context: (string) ($request->validated('context') ?? 'onboarding'),
            companyId: $request->integer('company_id') ?: null,
        );

        return response()->json([
            'success' => true,
            'message' => 'Checkout session created.',
            'data' => [
                'checkout_url' => $checkout->asStripeCheckoutSession()->url,
            ],
            'errors' => null,
        ]);
    }
}
