<?php

declare(strict_types=1);

namespace App\Support;

final class GeographyCatalog
{
    /** @var array<string, array<string, list<string>>>|null */
    private static ?array $cache = null;

    /** @return list<string> */
    public static function supportedCountryCodes(): array
    {
        return ['NG', 'GB', 'US', 'CA', 'IN'];
    }

    public static function isSupported(string $countryCode): bool
    {
        return in_array(strtoupper(trim($countryCode)), self::supportedCountryCodes(), true);
    }

    /** @return list<string> */
    public static function states(string $countryCode): array
    {
        $countryCode = strtoupper(trim($countryCode));
        $data = self::dataset()[$countryCode] ?? [];

        return array_values(array_keys($data));
    }

    /** @return list<string> */
    public static function lgas(string $countryCode, string $stateName): array
    {
        $countryCode = strtoupper(trim($countryCode));
        $stateName = trim($stateName);
        $data = self::dataset()[$countryCode] ?? [];

        return array_values($data[$stateName] ?? []);
    }

    /**
     * @return array<string, array<string, list<string>>>
     */
    private static function dataset(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }

        $dataset = [];

        foreach (self::supportedCountryCodes() as $countryCode) {
            $path = config_path('geography/' . strtolower($countryCode) . '.php');
            if (! is_file($path)) {
                continue;
            }

            /** @var array<string, list<string>> $states */
            $states = require $path;
            $dataset[$countryCode] = $states;
        }

        return self::$cache = $dataset;
    }
}
