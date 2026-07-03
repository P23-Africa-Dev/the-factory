<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Billing;

use App\Enums\BillingInterval;
use App\Http\Controllers\Controller;
use App\Http\Requests\Billing\GeneratePaymentLinkRequest;
use App\Models\Company;
use App\Models\CompanyDemoRequest;
use App\Models\User;
use App\Services\Billing\CompanySeatLimitService;
use App\Services\Billing\CompanySubscriptionService;
use App\Services\Billing\PaymentLinkService;
use Illuminate\Http\RedirectResponse;
use Illuminate\View\View;

class AdminPaymentLinkController extends Controller
{
    public function __construct(
        private readonly PaymentLinkService $paymentLinkService,
        private readonly CompanySubscriptionService $subscriptionService,
        private readonly CompanySeatLimitService $seatLimitService,
    ) {}

    public function forDemoRequest(GeneratePaymentLinkRequest $request, CompanyDemoRequest $demoRequest): RedirectResponse
    {
        $company = $demoRequest->company;

        if (! $company) {
            return back()->withErrors(['payment_link' => 'Approve this request and create a company before generating a payment link.']);
        }

        $result = $this->paymentLinkService->generate(
            company: $company,
            planKey: (string) $request->validated('plan_key'),
            interval: BillingInterval::from((string) $request->validated('interval')),
            sendEmail: (bool) $request->boolean('send_email'),
            recipient: $demoRequest->user,
        );

        return back()->with('payment_link_url', $result['url']);
    }

    public function forUser(GeneratePaymentLinkRequest $request, User $user): RedirectResponse
    {
        $company = $user->companies()->where('companies.status', 'active')->orderByPivot('joined_at', 'desc')->first();

        if (! $company) {
            return back()->withErrors(['payment_link' => 'This user is not attached to an active company.']);
        }

        $result = $this->paymentLinkService->generate(
            company: $company,
            planKey: (string) $request->validated('plan_key'),
            interval: BillingInterval::from((string) $request->validated('interval')),
            sendEmail: (bool) $request->boolean('send_email'),
            recipient: $user,
        );

        return back()->with('payment_link_url', $result['url']);
    }

    public static function billingSummary(Company $company): array
    {
        $service = app(CompanySubscriptionService::class);
        $seatService = app(CompanySeatLimitService::class);

        return [
            'status' => $service->statusPayload($company),
            'seat_usage' => $seatService->usage($company),
        ];
    }
}
