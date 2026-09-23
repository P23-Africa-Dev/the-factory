<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Billing;

use App\Enums\BillingInterval;
use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Services\Billing\CompanySeatLimitService;
use App\Services\Billing\CompanySubscriptionService;
use App\Support\Billing\BillingPlanCatalog;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AdminOfflinePlanController extends Controller
{
    public function __construct(
        private readonly CompanySubscriptionService $subscriptionService,
        private readonly CompanySeatLimitService $seatLimitService,
    ) {}

    public function update(Request $request, Company $company): RedirectResponse
    {
        $validated = $request->validate([
            'plan_key' => ['required', 'string', Rule::in(BillingPlanCatalog::keys())],
            'interval' => ['required', 'string', Rule::in(BillingInterval::values())],
            'payment_start_date' => ['required', 'date'],
        ]);

        $planKey = (string) $validated['plan_key'];
        $interval = BillingInterval::from((string) $validated['interval']);

        try {
            $this->seatLimitService->assertCanSwitchToPlan($company, $planKey);
        } catch (ValidationException $e) {
            return back()->withInput()->withErrors($e->errors());
        }

        $this->subscriptionService->activateOfflinePayment(
            company: $company,
            planKey: $planKey,
            interval: $interval,
            periodStart: Carbon::parse((string) $validated['payment_start_date'])->startOfDay(),
        );

        return back()->with('status', 'Offline plan updated. Seat limit and renewal dates now reflect the selected plan.');
    }
}
