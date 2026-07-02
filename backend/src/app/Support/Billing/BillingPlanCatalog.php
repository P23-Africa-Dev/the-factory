<?php

declare(strict_types=1);

namespace App\Support\Billing;

use App\Enums\BillingInterval;
use Illuminate\Support\Collection;
use InvalidArgumentException;

final class BillingPlanCatalog
{
    /**
     * @return array<string, array{label: string, seat_limit: int, monthly_amount: int, annual_amount: int, monthly_price_id: ?string, annual_price_id: ?string}>
     */
    public static function all(): array
    {
        return config('billing.plans', []);
    }

    public static function keys(): array
    {
        return array_keys(self::all());
    }

    public static function has(string $planKey): bool
    {
        return array_key_exists($planKey, self::all());
    }

    public static function get(string $planKey): array
    {
        if (! self::has($planKey)) {
            throw new InvalidArgumentException("Unknown billing plan [{$planKey}].");
        }

        return self::all()[$planKey];
    }

    public static function seatLimit(string $planKey): int
    {
        return (int) self::get($planKey)['seat_limit'];
    }

    public static function stripePriceId(string $planKey, BillingInterval $interval): ?string
    {
        $plan = self::get($planKey);
        $key = $interval === BillingInterval::ANNUAL ? 'annual_price_id' : 'monthly_price_id';

        $priceId = $plan[$key] ?? null;

        return is_string($priceId) && $priceId !== '' ? $priceId : null;
    }

    public static function amountCents(string $planKey, BillingInterval $interval): int
    {
        $plan = self::get($planKey);

        return (int) ($interval === BillingInterval::ANNUAL ? $plan['annual_amount'] : $plan['monthly_amount']);
    }

    public static function planKeyForStripePriceId(string $stripePriceId): ?string
    {
        foreach (self::all() as $planKey => $plan) {
            if (($plan['monthly_price_id'] ?? null) === $stripePriceId
                || ($plan['annual_price_id'] ?? null) === $stripePriceId) {
                return $planKey;
            }
        }

        return null;
    }

    public static function intervalForStripePriceId(string $stripePriceId): ?BillingInterval
    {
        foreach (self::all() as $plan) {
            if (($plan['monthly_price_id'] ?? null) === $stripePriceId) {
                return BillingInterval::MONTHLY;
            }

            if (($plan['annual_price_id'] ?? null) === $stripePriceId) {
                return BillingInterval::ANNUAL;
            }
        }

        return null;
    }

    /**
     * @return Collection<int, array<string, mixed>>
     */
    public static function publicCatalog(?string $lockedPlanKey = null): Collection
    {
        $plans = self::all();

        if ($lockedPlanKey !== null) {
            $plans = array_intersect_key($plans, [$lockedPlanKey => true]);
        }

        return collect($plans)->map(function (array $plan, string $key): array {
            return [
                'key' => $key,
                'label' => $plan['label'],
                'seat_limit' => (int) $plan['seat_limit'],
                'monthly_amount' => (int) $plan['monthly_amount'],
                'annual_amount' => (int) $plan['annual_amount'],
                'monthly_amount_display' => self::formatUsd((int) $plan['monthly_amount']),
                'annual_amount_display' => self::formatUsd((int) $plan['annual_amount']),
            ];
        })->values();
    }

    public static function formatUsd(int $amountCents): string
    {
        return '$' . number_format($amountCents / 100, $amountCents % 100 === 0 ? 0 : 2);
    }
}
