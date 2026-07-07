<?php

declare(strict_types=1);

namespace App\Services\Billing;

use App\Models\Admin;
use App\Models\PlatformSetting;

class BillingEnforcementSettingService
{
    public const KEY = 'billing.enforce';

    public function isEnabled(): bool
    {
        $fallback = (bool) config('billing.enforce', true);
        $stored = PlatformSetting::getValue(self::KEY);

        if ($stored === null) {
            return $fallback;
        }

        $parsed = filter_var($stored, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);

        return $parsed ?? $fallback;
    }

    public function setEnabled(bool $enabled, Admin $admin): PlatformSetting
    {
        return PlatformSetting::setValue(
            key: self::KEY,
            value: $enabled ? 'true' : 'false',
            updatedByAdminId: $admin->id,
        );
    }

    public function snapshot(): array
    {
        $setting = PlatformSetting::query()->where('key', self::KEY)->first();

        return [
            'enabled' => $this->isEnabled(),
            'updated_at' => $setting?->updated_at?->toIso8601String(),
        ];
    }
}
