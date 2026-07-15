<?php

declare(strict_types=1);

namespace App\Services\Billing;

use App\Enums\BillingInterval;
use App\Models\Admin;
use App\Models\Company;
use App\Models\CompanyMapCredit;
use App\Models\MapCreditSku;
use App\Models\MapCreditTransaction;
use App\Support\Billing\BillingPlanCatalog;
use Illuminate\Support\Facades\DB;

/**
 * Meters Google (map) API usage against per-organization credits.
 *
 * Credits live in two buckets on `company_map_credits`:
 *   - plan_credits  : granted from the plan (5% of monthly price), reset each cycle
 *   - topup_credits : purchased, roll over forever
 *
 * Consumption spends plan credits first, then top-up credits.
 */
class MapCreditService
{
    /** Fallback SKU costs (credits) used if the map_credit_skus table is empty. */
    private const FALLBACK_SKU_COST = [
        'nearby' => 3.2,
        'poi-details' => 2.0,
        'details' => 0.5,
        'autocomplete' => 0.283,
    ];

    public function __construct(
        private readonly CreditAllocationSettingService $settings,
    ) {}

    public function creditsPerUsd(): float
    {
        return $this->settings->creditsPerUsd();
    }

    public function usdToCredits(float $usd): float
    {
        return round($usd * $this->creditsPerUsd(), 4);
    }

    public function creditsToUsd(float $credits): float
    {
        $rate = $this->creditsPerUsd();

        return $rate > 0 ? round($credits / $rate, 4) : 0.0;
    }

    /**
     * Monthly credit allocation for a company = allocation_percent% of the plan's
     * monthly price, converted to credits. Returns 0 when the company has no plan.
     */
    public function allocationCredits(Company $company): float
    {
        $planKey = (string) ($company->subscription_plan_key ?? '');

        if ($planKey === '' || ! BillingPlanCatalog::has($planKey)) {
            return 0.0;
        }

        $monthlyCents = BillingPlanCatalog::amountCents($planKey, BillingInterval::MONTHLY);
        $dollars = $monthlyCents / 100;
        $percent = $this->settings->allocationPercent();

        return round($dollars * ($percent / 100) * $this->creditsPerUsd(), 4);
    }

    public function skuCost(string $sku): float
    {
        $row = $this->skuCatalog()[$sku] ?? null;

        if ($row !== null) {
            return (float) $row;
        }

        return self::FALLBACK_SKU_COST[$sku] ?? 0.0;
    }

    public function isMeteredFor(Company $company): bool
    {
        if ($company->isDemo()) {
            return false;
        }

        return $this->settings->enforcementEnabled();
    }

    /**
     * Attempt to spend credits for one billed Google call.
     *
     * @return array<string, mixed> { allowed, blocked, low, balance, ... }
     */
    public function consume(Company $company, string $sku, string $source = 'system', float $units = 1.0): array
    {
        $units = max(0.0, $units);
        $cost = round($this->skuCost($sku) * $units, 4);
        $metered = $this->isMeteredFor($company);

        return DB::transaction(function () use ($company, $sku, $cost, $metered, $source, $units): array {
            $record = $this->lockRecord($company);
            $balanceBefore = $record->totalBalance();

            // Nothing to charge (unknown SKU / zero units): allow, no ledger noise.
            if ($cost <= 0) {
                return $this->consumeResult($record, allowed: true, blocked: false, metered: $metered);
            }

            if ($metered && $balanceBefore < $cost) {
                return $this->consumeResult($record, allowed: false, blocked: true, metered: $metered);
            }

            // Always track real usage for reporting.
            $record->lifetime_consumed = (float) $record->lifetime_consumed + $cost;

            if ($metered) {
                $fromPlan = min((float) $record->plan_credits, $cost);
                $record->plan_credits = round((float) $record->plan_credits - $fromPlan, 4);
                $remaining = round($cost - $fromPlan, 4);

                if ($remaining > 0) {
                    $record->topup_credits = round(max(0.0, (float) $record->topup_credits - $remaining), 4);
                }
            }

            $record->save();

            $balanceAfter = $metered ? $record->totalBalance() : $balanceBefore;

            MapCreditTransaction::create([
                'company_id' => $company->id,
                'type' => MapCreditTransaction::TYPE_CONSUMPTION,
                'sku' => $sku,
                'credits' => -$cost,
                'usd_amount' => -$this->creditsToUsd($cost),
                'balance_after' => $balanceAfter,
                'source' => $source,
                'meta' => ['units' => $units, 'metered' => $metered],
            ]);

            return $this->consumeResult($record, allowed: true, blocked: false, metered: $metered);
        });
    }

    public function addTopup(Company $company, float $credits, array $meta = [], string $source = 'webhook'): CompanyMapCredit
    {
        $credits = round(max(0.0, $credits), 4);

        return DB::transaction(function () use ($company, $credits, $meta, $source): CompanyMapCredit {
            $record = $this->lockRecord($company);

            if ($credits > 0) {
                $record->topup_credits = round((float) $record->topup_credits + $credits, 4);
                $record->lifetime_topped_up = round((float) $record->lifetime_topped_up + $credits, 4);
                $record->save();

                MapCreditTransaction::create([
                    'company_id' => $company->id,
                    'type' => MapCreditTransaction::TYPE_TOPUP,
                    'sku' => null,
                    'credits' => $credits,
                    'usd_amount' => $this->creditsToUsd($credits),
                    'balance_after' => $record->totalBalance(),
                    'source' => $source,
                    'meta' => $meta,
                ]);
            }

            return $record;
        });
    }

    /** Grant / refresh the plan allocation on subscription activation. */
    public function allocateForActivation(Company $company): CompanyMapCredit
    {
        return $this->applyPlanGrant($company, MapCreditTransaction::TYPE_ALLOCATION, 'webhook');
    }

    /** Reset plan credits to the current allocation at the start of a new cycle. */
    public function resetPlanCredits(Company $company, string $source = 'system'): CompanyMapCredit
    {
        return $this->applyPlanGrant($company, MapCreditTransaction::TYPE_RESET, $source);
    }

    public function adminAdjust(Company $company, float $creditsDelta, Admin $admin, string $reason = ''): CompanyMapCredit
    {
        $creditsDelta = round($creditsDelta, 4);

        return DB::transaction(function () use ($company, $creditsDelta, $admin, $reason): CompanyMapCredit {
            $record = $this->lockRecord($company);
            $record->topup_credits = round(max(0.0, (float) $record->topup_credits + $creditsDelta), 4);
            $record->save();

            MapCreditTransaction::create([
                'company_id' => $company->id,
                'type' => MapCreditTransaction::TYPE_ADMIN_ADJUST,
                'sku' => null,
                'credits' => $creditsDelta,
                'usd_amount' => $this->creditsToUsd($creditsDelta),
                'balance_after' => $record->totalBalance(),
                'source' => 'admin',
                'meta' => ['admin_id' => $admin->id, 'reason' => $reason],
            ]);

            return $record;
        });
    }

    public function isLow(Company $company): bool
    {
        return $this->isLowBalance($this->ensureRecord($company));
    }

    /**
     * @return array<string, mixed>
     */
    public function snapshot(Company $company): array
    {
        $record = $this->ensureRecord($company);
        $allocation = (float) $record->allocation_credits;
        $plan = (float) $record->plan_credits;
        $topup = (float) $record->topup_credits;
        $balance = $record->totalBalance();
        $metered = $this->isMeteredFor($company);
        $planKey = (string) ($company->subscription_plan_key ?? '');
        $planLabel = ($planKey !== '' && BillingPlanCatalog::has($planKey))
            ? BillingPlanCatalog::get($planKey)['label']
            : null;

        return [
            'balance' => round($balance, 2),
            'balance_usd' => $this->creditsToUsd($balance),
            'plan_credits' => round($plan, 2),
            'topup_credits' => round($topup, 2),
            'allocation_credits' => round($allocation, 2),
            'used_this_cycle' => round(max(0.0, $allocation - $plan), 2),
            'lifetime_consumed' => round((float) $record->lifetime_consumed, 2),
            'lifetime_topped_up' => round((float) $record->lifetime_topped_up, 2),
            'credits_per_usd' => $this->creditsPerUsd(),
            'low' => $this->isLowBalance($record),
            'low_threshold_percent' => $this->settings->lowThresholdPercent(),
            'enforcement_enabled' => $this->settings->enforcementEnabled(),
            'metered' => $metered,
            'exhausted' => $metered && $balance <= 0,
            'plan_key' => $planKey !== '' ? $planKey : null,
            'plan_label' => $planLabel,
            'period_start' => $record->period_start?->toIso8601String(),
            'period_end' => $record->period_end?->toIso8601String(),
            'last_reset_at' => $record->last_reset_at?->toIso8601String(),
        ];
    }

    public function ensureRecord(Company $company): CompanyMapCredit
    {
        $record = CompanyMapCredit::query()->firstOrNew(['company_id' => $company->id]);

        if (! $record->exists) {
            $allocation = $this->allocationCredits($company);
            $record->fill([
                'allocation_credits' => $allocation,
                'plan_credits' => $allocation,
                'topup_credits' => 0,
                'lifetime_consumed' => 0,
                'lifetime_topped_up' => 0,
                'period_start' => $company->subscription_current_period_start ?? now(),
                'period_end' => now()->addMonthNoOverflow(),
                'last_reset_at' => now(),
            ]);
            $record->save();
        }

        return $record;
    }

    private function applyPlanGrant(Company $company, string $type, string $source): CompanyMapCredit
    {
        $this->ensureRecord($company);

        return DB::transaction(function () use ($company, $type, $source): CompanyMapCredit {
            $record = $this->lockRecord($company);
            $allocation = $this->allocationCredits($company);

            $record->allocation_credits = $allocation;
            $record->plan_credits = $allocation;
            $record->period_start = now();
            $record->period_end = now()->addMonthNoOverflow();
            $record->last_reset_at = now();
            $record->save();

            MapCreditTransaction::create([
                'company_id' => $company->id,
                'type' => $type,
                'sku' => null,
                'credits' => $allocation,
                'usd_amount' => $this->creditsToUsd($allocation),
                'balance_after' => $record->totalBalance(),
                'source' => $source,
                'meta' => ['plan_key' => $company->subscription_plan_key],
            ]);

            return $record;
        });
    }

    private function lockRecord(Company $company): CompanyMapCredit
    {
        $this->ensureRecord($company);

        /** @var CompanyMapCredit $record */
        $record = CompanyMapCredit::query()
            ->where('company_id', $company->id)
            ->lockForUpdate()
            ->first();

        return $record;
    }

    private function isLowBalance(CompanyMapCredit $record): bool
    {
        $company = $record->company ?? Company::query()->find($record->company_id);

        if ($company === null || ! $this->isMeteredFor($company)) {
            return false;
        }

        $balance = $record->totalBalance();

        if ($balance <= 0) {
            return true;
        }

        $allocation = (float) $record->allocation_credits;

        if ($allocation <= 0) {
            return false;
        }

        $threshold = $allocation * ($this->settings->lowThresholdPercent() / 100);

        return $balance <= $threshold;
    }

    /**
     * @param  CompanyMapCredit  $record
     * @return array<string, mixed>
     */
    private function consumeResult(CompanyMapCredit $record, bool $allowed, bool $blocked, bool $metered): array
    {
        $balance = $record->totalBalance();

        return [
            'allowed' => $allowed,
            'blocked' => $blocked,
            'metered' => $metered,
            'balance' => round($balance, 2),
            'low' => $this->isLowBalance($record),
        ];
    }

    /**
     * @return array<string, float>
     */
    private function skuCatalog(): array
    {
        static $cache = null;

        if ($cache !== null) {
            return $cache;
        }

        try {
            $rows = MapCreditSku::query()
                ->where('is_active', true)
                ->pluck('credit_cost', 'sku')
                ->map(static fn ($cost): float => (float) $cost)
                ->all();
        } catch (\Throwable) {
            $rows = [];
        }

        return $cache = $rows;
    }
}
