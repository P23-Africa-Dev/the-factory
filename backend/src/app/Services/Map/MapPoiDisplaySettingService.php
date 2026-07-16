<?php

declare(strict_types=1);

namespace App\Services\Map;

use App\Models\Admin;
use App\Models\Company;
use App\Models\PlatformSetting;

/**
 * Super-admin-tunable control for the Google Places business-pin display.
 *
 * Two levels:
 *   - Global master toggle (PlatformSetting `map.poi_display`), config fallback
 *     `config('maps.poi_display_enabled', true)`.
 *   - Per-organization override (`companies.map_poi_display_enabled`): null means
 *     inherit the global toggle, true/false force the org on/off.
 *
 * Effective value for a company = override (if set) else the global toggle.
 */
class MapPoiDisplaySettingService
{
    public const KEY = 'map.poi_display';

    public function globalEnabled(): bool
    {
        $fallback = (bool) config('maps.poi_display_enabled', true);
        $stored = PlatformSetting::getValue(self::KEY);

        if ($stored === null || $stored === '') {
            return $fallback;
        }

        $parsed = filter_var($stored, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);

        return $parsed ?? $fallback;
    }

    public function setGlobal(bool $enabled, Admin $admin): void
    {
        PlatformSetting::setValue(self::KEY, $enabled ? 'true' : 'false', $admin->id);
    }

    /**
     * @param  bool|null  $enabled  null clears the override (inherit global)
     */
    public function setCompanyOverride(Company $company, ?bool $enabled, ?Admin $admin = null): void
    {
        $company->forceFill(['map_poi_display_enabled' => $enabled])->save();
    }

    public function companyOverride(Company $company): ?bool
    {
        $value = $company->map_poi_display_enabled;

        return $value === null ? null : (bool) $value;
    }

    public function isEnabledForCompany(Company $company): bool
    {
        $override = $this->companyOverride($company);

        if ($override !== null) {
            return $override;
        }

        return $this->globalEnabled();
    }

    /**
     * @return array{enabled: bool, updated_at: string|null}
     */
    public function snapshot(): array
    {
        $setting = PlatformSetting::query()->where('key', self::KEY)->first();

        return [
            'enabled' => $this->globalEnabled(),
            'updated_at' => $setting?->updated_at?->toIso8601String(),
        ];
    }
}
