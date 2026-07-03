<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Billing;

use App\Enums\SubscriptionStatus;
use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Services\Billing\BillingEnforcementSettingService;
use App\Support\Billing\BillingPlanCatalog;
use Illuminate\Support\Collection;
use Illuminate\View\View;

class BillingOverviewController extends Controller
{
    public function __construct(private readonly BillingEnforcementSettingService $billingEnforcement) {}

    public function __invoke(): View
    {
        $plans = $this->plans();

        $activeSubscriptionStatuses = [
            SubscriptionStatus::ACTIVE->value,
            SubscriptionStatus::PAST_DUE->value,
            SubscriptionStatus::GRACE->value,
        ];

        $stats = [
            'active_plan_count' => $plans->where('is_active', true)->count(),
            'total_plan_count' => $plans->count(),
            'active_subscription_companies' => Company::query()
                ->whereIn('subscription_status', $activeSubscriptionStatuses)
                ->count(),
            'pending_payment_companies' => Company::query()
                ->where('subscription_status', SubscriptionStatus::PENDING_PAYMENT->value)
                ->count(),
            'assigned_plan_companies' => Company::query()
                ->whereNotNull('assigned_plan_key')
                ->where('assigned_plan_key', '!=', '')
                ->count(),
        ];

        return view('admin.billing.index', [
            'billingEnforced' => $this->billingEnforcement->isEnabled(),
            'enforcementSnapshot' => $this->billingEnforcement->snapshot(),
            'plansPreview' => $plans->take(6),
            'stats' => $stats,
        ]);
    }

    /**
     * @return Collection<int, array{plan_key: string, label: string, seat_limit: int, monthly_amount: int, annual_amount: int, monthly_price_id: ?string, annual_price_id: ?string, is_active: bool, sort_order: int}>
     */
    private function plans(): Collection
    {
        return collect(BillingPlanCatalog::all())
            ->map(static function (array $plan, string $planKey): array {
                return [
                    'plan_key' => $planKey,
                    'label' => (string) ($plan['label'] ?? $planKey),
                    'seat_limit' => (int) ($plan['seat_limit'] ?? 0),
                    'monthly_amount' => (int) ($plan['monthly_amount'] ?? 0),
                    'annual_amount' => (int) ($plan['annual_amount'] ?? 0),
                    'monthly_price_id' => isset($plan['monthly_price_id']) && $plan['monthly_price_id'] !== ''
                        ? (string) $plan['monthly_price_id']
                        : null,
                    'annual_price_id' => isset($plan['annual_price_id']) && $plan['annual_price_id'] !== ''
                        ? (string) $plan['annual_price_id']
                        : null,
                    'is_active' => (bool) ($plan['is_active'] ?? true),
                    'sort_order' => (int) ($plan['sort_order'] ?? 0),
                ];
            })
            ->sortBy([
                ['sort_order', 'asc'],
                ['seat_limit', 'asc'],
            ])
            ->values();
    }
}
