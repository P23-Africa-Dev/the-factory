<?php

declare(strict_types=1);

namespace App\Services\Places;

use App\Models\Admin;
use App\Models\PlatformSetting;
use Illuminate\Support\Facades\Cache;

final class PlacesSettingsService
{
    public const KEY_GEOAPIFY = 'places.geoapify_enabled';

    public const KEY_FOURSQUARE = 'places.foursquare_enabled';

    public const KEY_GOOGLE = 'places.google_enabled';

    public const KEY_THRESHOLD = 'places.quality_threshold';

    public const KEY_CACHE = 'places.cache_enabled';

    public function snapshot(): array
    {
        return [
            'geoapify_enabled' => $this->boolSetting(self::KEY_GEOAPIFY, (bool) config('places.providers.geoapify.enabled', true)),
            'foursquare_enabled' => $this->boolSetting(self::KEY_FOURSQUARE, (bool) config('places.providers.foursquare.enabled', true)),
            'google_enabled' => $this->boolSetting(self::KEY_GOOGLE, (bool) config('places.providers.google.enabled', true)),
            'cache_enabled' => $this->boolSetting(self::KEY_CACHE, (bool) config('places.cache_enabled', true)),
            'quality_threshold' => $this->floatSetting(self::KEY_THRESHOLD, (float) config('places.quality_threshold', 0.80)),
            'google_daily_budget' => (int) config('places.google_daily_budget', 200),
            'keys_configured' => [
                'geoapify' => trim((string) config('places.providers.geoapify.api_key')) !== '',
                'foursquare' => trim((string) config('places.providers.foursquare.api_key')) !== '',
                'google' => trim((string) config('places.providers.google.api_key')) !== '',
            ],
        ];
    }

    public function applyRuntimeConfig(): void
    {
        $snap = $this->snapshot();
        config([
            'places.providers.geoapify.enabled' => $snap['geoapify_enabled'],
            'places.providers.foursquare.enabled' => $snap['foursquare_enabled'],
            'places.providers.google.enabled' => $snap['google_enabled'],
            'places.cache_enabled' => $snap['cache_enabled'],
            'places.quality_threshold' => $snap['quality_threshold'],
        ]);
    }

    public function update(array $input, Admin $admin): array
    {
        if (array_key_exists('geoapify_enabled', $input)) {
            $this->put(self::KEY_GEOAPIFY, $input['geoapify_enabled'] ? '1' : '0', $admin);
        }
        if (array_key_exists('foursquare_enabled', $input)) {
            $this->put(self::KEY_FOURSQUARE, $input['foursquare_enabled'] ? '1' : '0', $admin);
        }
        if (array_key_exists('google_enabled', $input)) {
            $this->put(self::KEY_GOOGLE, $input['google_enabled'] ? '1' : '0', $admin);
        }
        if (array_key_exists('cache_enabled', $input)) {
            $this->put(self::KEY_CACHE, $input['cache_enabled'] ? '1' : '0', $admin);
        }
        if (array_key_exists('quality_threshold', $input)) {
            $threshold = max(0.1, min(1.0, (float) $input['quality_threshold']));
            $this->put(self::KEY_THRESHOLD, (string) $threshold, $admin);
        }

        Cache::forget('places.settings.snapshot');
        $this->applyRuntimeConfig();

        return $this->snapshot();
    }

    private function put(string $key, string $value, Admin $admin): void
    {
        PlatformSetting::query()->updateOrCreate(
            ['key' => $key],
            [
                'value' => $value,
                'updated_by_admin_id' => $admin->id,
            ]
        );
    }

    private function boolSetting(string $key, bool $default): bool
    {
        $setting = PlatformSetting::query()->where('key', $key)->first();
        if ($setting === null) {
            return $default;
        }

        return in_array(strtolower(trim((string) $setting->value)), ['1', 'true', 'yes', 'on'], true);
    }

    private function floatSetting(string $key, float $default): float
    {
        $setting = PlatformSetting::query()->where('key', $key)->first();
        if ($setting === null || ! is_numeric($setting->value)) {
            return $default;
        }

        return (float) $setting->value;
    }
}
