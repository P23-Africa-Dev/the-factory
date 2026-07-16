<?php

declare(strict_types=1);

namespace App\Services\Billing;

use App\Models\Admin;
use App\Models\PlatformSetting;

/**
 * Super-admin-tunable global settings for the map-credit system.
 *
 * All values fall back to config('billing.*') until an admin overrides them
 * from the control dashboard. Stored via the generic PlatformSetting store.
 */
class CreditAllocationSettingService
{
    public const KEY_PERCENT = 'credit.allocation_percent';
    public const KEY_CREDITS_PER_USD = 'credit.credits_per_usd';
    public const KEY_LOW_THRESHOLD = 'credit.low_threshold_percent';
    public const KEY_ENFORCE = 'credit.enforce';

    public function allocationPercent(): float
    {
        return $this->floatSetting(self::KEY_PERCENT, (float) config('billing.credit_allocation_percent', 5));
    }

    public function creditsPerUsd(): float
    {
        $value = $this->floatSetting(self::KEY_CREDITS_PER_USD, (float) config('billing.credits_per_usd', 100));

        return $value > 0 ? $value : 100.0;
    }

    public function lowThresholdPercent(): float
    {
        return $this->floatSetting(self::KEY_LOW_THRESHOLD, (float) config('billing.low_credit_threshold_percent', 15));
    }

    public function enforcementEnabled(): bool
    {
        $fallback = (bool) config('billing.credit_enforce', true);
        $stored = PlatformSetting::getValue(self::KEY_ENFORCE);

        if ($stored === null) {
            return $fallback;
        }

        $parsed = filter_var($stored, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);

        return $parsed ?? $fallback;
    }

    public function setAllocationPercent(float $percent, Admin $admin): void
    {
        $percent = max(0.0, min(100.0, $percent));
        PlatformSetting::setValue(self::KEY_PERCENT, (string) $percent, $admin->id);
    }

    public function setCreditsPerUsd(float $creditsPerUsd, Admin $admin): void
    {
        $creditsPerUsd = max(1.0, $creditsPerUsd);
        PlatformSetting::setValue(self::KEY_CREDITS_PER_USD, (string) $creditsPerUsd, $admin->id);
    }

    public function setLowThresholdPercent(float $percent, Admin $admin): void
    {
        $percent = max(0.0, min(100.0, $percent));
        PlatformSetting::setValue(self::KEY_LOW_THRESHOLD, (string) $percent, $admin->id);
    }

    public function setEnforcement(bool $enabled, Admin $admin): void
    {
        PlatformSetting::setValue(self::KEY_ENFORCE, $enabled ? 'true' : 'false', $admin->id);
    }

    /**
     * @return array<string, mixed>
     */
    public function snapshot(): array
    {
        $updatedAt = PlatformSetting::query()
            ->whereIn('key', [self::KEY_PERCENT, self::KEY_CREDITS_PER_USD, self::KEY_LOW_THRESHOLD, self::KEY_ENFORCE])
            ->max('updated_at');

        return [
            'allocation_percent' => $this->allocationPercent(),
            'credits_per_usd' => $this->creditsPerUsd(),
            'low_threshold_percent' => $this->lowThresholdPercent(),
            'enforcement_enabled' => $this->enforcementEnabled(),
            'updated_at' => $updatedAt,
        ];
    }

    private function floatSetting(string $key, float $fallback): float
    {
        $stored = PlatformSetting::getValue($key);

        if ($stored === null || $stored === '') {
            return $fallback;
        }

        return is_numeric($stored) ? (float) $stored : $fallback;
    }
}
