<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\BillingPlan;
use App\Support\Billing\BillingPlanCatalog;
use Illuminate\Database\Seeder;

class BillingPlanSeeder extends Seeder
{
    public function run(): void
    {
        $plans = config('billing.plans', []);
        $sortOrder = 0;

        foreach ($plans as $planKey => $plan) {
            if (! is_array($plan)) {
                continue;
            }

            BillingPlan::query()->updateOrCreate(
                ['plan_key' => (string) $planKey],
                [
                    'label' => (string) ($plan['label'] ?? $planKey),
                    'seat_limit' => (int) ($plan['seat_limit'] ?? 0),
                    'monthly_amount' => (int) ($plan['monthly_amount'] ?? 0),
                    'annual_amount' => (int) ($plan['annual_amount'] ?? 0),
                    'monthly_price_id' => ($plan['monthly_price_id'] ?? null) ?: null,
                    'annual_price_id' => ($plan['annual_price_id'] ?? null) ?: null,
                    'is_active' => (bool) ($plan['is_active'] ?? true),
                    'sort_order' => (int) ($plan['sort_order'] ?? $sortOrder),
                ]
            );

            $sortOrder += 10;
        }

        BillingPlanCatalog::clearCache();
    }
}
