<?php

declare(strict_types=1);

namespace App\Support\Billing;

use App\Enums\BillingInterval;
use App\Models\BillingPlan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Collection;
use InvalidArgumentException;
use Throwable;

final class BillingPlanCatalog
{
    private const CACHE_KEY = 'billing.catalog';

    /**
     * @return array<string, array{label: string, seat_limit: int, monthly_amount: int, annual_amount: int, monthly_price_id: ?string, annual_price_id: ?string, is_active: bool, sort_order: int}>
     */
    public static function all(): array
    {
        /** @var array<string, array{label: string, seat_limit: int, monthly_amount: int, annual_amount: int, monthly_price_id: ?string, annual_price_id: ?string, is_active: bool, sort_order: int}> $plans */
        $plans = Cache::rememberForever(self::CACHE_KEY, static function (): array {
            $databasePlans = self::fromDatabase();

            if ($databasePlans !== null && $databasePlans !== []) {
                return $databasePlans;
            }

            return self::normalize((array) config('billing.plans', []));
        });

        return $plans;
    }

    public static function clearCache(): void
    {
        Cache::forget(self::CACHE_KEY);
    }

    public static function keys(bool $activeOnly = false): array
    {
        if (! $activeOnly) {
            return array_keys(self::all());
        }

        return array_keys(array_filter(
            self::all(),
            static fn(array $plan): bool => (bool) ($plan['is_active'] ?? true)
        ));
    }

    public static function activeKeys(): array
    {
        return self::keys(activeOnly: true);
    }

    public static function has(string $planKey): bool
    {
        return array_key_exists($planKey, self::all());
    }

    public static function isActive(string $planKey): bool
    {
        $plan = self::all()[$planKey] ?? null;

        if (! is_array($plan)) {
            return false;
        }

        return (bool) ($plan['is_active'] ?? true);
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
                || ($plan['annual_price_id'] ?? null) === $stripePriceId
            ) {
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
        } else {
            $plans = array_filter($plans, static fn(array $plan): bool => (bool) ($plan['is_active'] ?? true));
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

    /**
     * @return array<string, array{label: string, seat_limit: int, monthly_amount: int, annual_amount: int, monthly_price_id: ?string, annual_price_id: ?string, is_active: bool, sort_order: int}>|null
     */
    private static function fromDatabase(): ?array
    {
        try {
            if (! Schema::hasTable('billing_plans')) {
                return null;
            }

            $plans = BillingPlan::query()
                ->orderBy('sort_order')
                ->orderBy('seat_limit')
                ->get();

            if ($plans->isEmpty()) {
                return null;
            }

            return $plans->mapWithKeys(static function (BillingPlan $plan): array {
                return [
                    $plan->plan_key => [
                        'label' => (string) $plan->label,
                        'seat_limit' => (int) $plan->seat_limit,
                        'monthly_amount' => (int) $plan->monthly_amount,
                        'annual_amount' => (int) $plan->annual_amount,
                        'monthly_price_id' => $plan->monthly_price_id,
                        'annual_price_id' => $plan->annual_price_id,
                        'is_active' => (bool) $plan->is_active,
                        'sort_order' => (int) $plan->sort_order,
                    ],
                ];
            })->all();
        } catch (Throwable) {
            return null;
        }
    }

    /**
     * @param  array<string, mixed>  $plans
     * @return array<string, array{label: string, seat_limit: int, monthly_amount: int, annual_amount: int, monthly_price_id: ?string, annual_price_id: ?string, is_active: bool, sort_order: int}>
     */
    private static function normalize(array $plans): array
    {
        $sortOrder = 0;

        return collect($plans)->mapWithKeys(static function (mixed $plan, string $key) use (&$sortOrder): array {
            $planData = is_array($plan) ? $plan : [];
            $resolvedSortOrder = (int) ($planData['sort_order'] ?? $sortOrder);
            $sortOrder += 10;

            return [
                (string) $key => [
                    'label' => (string) ($planData['label'] ?? $key),
                    'seat_limit' => (int) ($planData['seat_limit'] ?? 0),
                    'monthly_amount' => (int) ($planData['monthly_amount'] ?? 0),
                    'annual_amount' => (int) ($planData['annual_amount'] ?? 0),
                    'monthly_price_id' => isset($planData['monthly_price_id']) && $planData['monthly_price_id'] !== ''
                        ? (string) $planData['monthly_price_id']
                        : null,
                    'annual_price_id' => isset($planData['annual_price_id']) && $planData['annual_price_id'] !== ''
                        ? (string) $planData['annual_price_id']
                        : null,
                    'is_active' => (bool) ($planData['is_active'] ?? true),
                    'sort_order' => $resolvedSortOrder,
                ],
            ];
        })->all();
    }
}
