<?php

declare(strict_types=1);

namespace App\Services\Map;

use App\Models\Admin;
use App\Models\PlatformSetting;
use Illuminate\Support\Facades\Cache;

class MapProviderSettingService
{
    public const KEY = 'map.provider';

    public const MAPBOX = 'mapbox';

    public const GOOGLE = 'google';

    private const CACHE_KEY = 'platform_settings.map_provider';

    public function getProvider(): string
    {
        return Cache::rememberForever(self::CACHE_KEY, function (): string {
            $setting = PlatformSetting::query()->where('key', self::KEY)->first();
            $normalized = $this->normalize($setting?->value);

            if ($normalized !== null) {
                return $normalized;
            }

            return $this->defaultProvider();
        });
    }

    public function getSnapshot(): array
    {
        $setting = PlatformSetting::query()->where('key', self::KEY)->first();

        return [
            'provider' => $this->normalize($setting?->value) ?? $this->defaultProvider(),
            'updated_at' => $setting?->updated_at?->toIso8601String(),
        ];
    }

    public function setProvider(string $provider, Admin $admin): PlatformSetting
    {
        $normalized = $this->normalize($provider) ?? $this->defaultProvider();

        $setting = PlatformSetting::query()->updateOrCreate(
            ['key' => self::KEY],
            [
                'value' => $normalized,
                'updated_by_admin_id' => $admin->id,
            ]
        );

        Cache::forever(self::CACHE_KEY, $normalized);

        return $setting;
    }

    private function defaultProvider(): string
    {
        $configured = $this->normalize((string) config('maps.default_provider', self::MAPBOX));

        return $configured ?? self::MAPBOX;
    }

    private function normalize(?string $value): ?string
    {
        $normalized = strtolower(trim((string) $value));

        if ($normalized === self::MAPBOX || $normalized === self::GOOGLE) {
            return $normalized;
        }

        return null;
    }
}
