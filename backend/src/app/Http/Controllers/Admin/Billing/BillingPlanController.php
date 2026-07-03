<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Billing;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\Billing\SaveBillingPlanRequest;
use App\Models\BillingPlan;
use App\Models\Company;
use App\Models\CompanyDemoRequest;
use App\Support\Billing\BillingPlanCatalog;
use Illuminate\Http\RedirectResponse;
use Illuminate\View\View;

class BillingPlanController extends Controller
{
    public function index(): View
    {
        return view('admin.billing.plans.index', [
            'plans' => BillingPlan::query()
                ->orderBy('sort_order')
                ->orderBy('seat_limit')
                ->paginate(25),
        ]);
    }

    public function create(): View
    {
        return view('admin.billing.plans.create');
    }

    public function store(SaveBillingPlanRequest $request): RedirectResponse
    {
        BillingPlan::query()->create($this->payload($request));
        BillingPlanCatalog::clearCache();

        return redirect()
            ->route('admin.billing.plans.index')
            ->with('status', 'Billing plan created successfully.');
    }

    public function edit(BillingPlan $plan): View
    {
        return view('admin.billing.plans.edit', [
            'plan' => $plan,
        ]);
    }

    public function update(SaveBillingPlanRequest $request, BillingPlan $plan): RedirectResponse
    {
        $plan->update($this->payload($request));
        BillingPlanCatalog::clearCache();

        return redirect()
            ->route('admin.billing.plans.index')
            ->with('status', 'Billing plan updated successfully.');
    }

    public function destroy(BillingPlan $plan): RedirectResponse
    {
        $inUseByCompanies = Company::query()
            ->where('subscription_plan_key', $plan->plan_key)
            ->orWhere('assigned_plan_key', $plan->plan_key)
            ->exists();

        $inUseByDemoRequests = CompanyDemoRequest::query()
            ->where('assigned_plan_key', $plan->plan_key)
            ->exists();

        if ($inUseByCompanies || $inUseByDemoRequests) {
            return back()->with('error', 'This plan is currently assigned to one or more accounts and cannot be deleted.');
        }

        $plan->delete();
        BillingPlanCatalog::clearCache();

        return redirect()
            ->route('admin.billing.plans.index')
            ->with('status', 'Billing plan deleted successfully.');
    }

    private function payload(SaveBillingPlanRequest $request): array
    {
        $validated = $request->validated();

        return [
            'plan_key' => (string) $validated['plan_key'],
            'label' => (string) $validated['label'],
            'seat_limit' => (int) $validated['seat_limit'],
            'monthly_amount' => (int) $validated['monthly_amount'],
            'annual_amount' => (int) $validated['annual_amount'],
            'monthly_price_id' => isset($validated['monthly_price_id']) && $validated['monthly_price_id'] !== ''
                ? (string) $validated['monthly_price_id']
                : null,
            'annual_price_id' => isset($validated['annual_price_id']) && $validated['annual_price_id'] !== ''
                ? (string) $validated['annual_price_id']
                : null,
            'is_active' => $request->boolean('is_active'),
            'sort_order' => (int) ($validated['sort_order'] ?? 0),
        ];
    }
}
