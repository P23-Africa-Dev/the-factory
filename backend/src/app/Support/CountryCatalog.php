<?php

declare(strict_types=1);

namespace App\Support;

use Symfony\Component\Intl\Countries;

final class CountryCatalog
{
    /** @var array<string, string>|null */
    private static ?array $cachedNames = null;

    /** @return array<string, string> */
    public static function names(): array
    {
        if (self::$cachedNames !== null) {
            return self::$cachedNames;
        }

        if (class_exists(Countries::class)) {
            return self::$cachedNames = Countries::getNames('en');
        }

        $configured = config('countries.names');

        if (! is_array($configured) || $configured === []) {
            throw new \RuntimeException('Country catalog is not configured.');
        }

        return self::$cachedNames = $configured;
    }

    /** @return list<array{label: string, value: string, code: string}> */
    public static function asOptions(): array
    {
        return collect(self::names())
            ->map(fn (string $name, string $code): array => [
                'label' => $name,
                'value' => $name,
                'code' => strtoupper($code),
            ])
            ->sortBy('label', SORT_NATURAL | SORT_FLAG_CASE)
            ->values()
            ->all();
    }

    /** @return list<string> */
    public static function codes(): array
    {
        return array_keys(self::names());
    }

    public static function resolveName(string $country): ?string
    {
        $country = trim($country);

        if ($country === '') {
            return null;
        }

        $names = self::names();

        if (in_array($country, $names, true)) {
            return $country;
        }

        if (strlen($country) === 2 && ctype_alpha($country)) {
            return $names[strtoupper($country)] ?? null;
        }

        foreach ($names as $name) {
            if (strcasecmp($name, $country) === 0) {
                return $name;
            }
        }

        return null;
    }

    public static function resolveCode(string $country): ?string
    {
        $country = trim($country);

        if ($country === '') {
            return null;
        }

        if (strlen($country) === 2 && ctype_alpha($country)) {
            $code = strtoupper($country);

            return array_key_exists($code, self::names()) ? $code : null;
        }

        $name = self::resolveName($country);

        if ($name === null) {
            return null;
        }

        $code = array_search($name, self::names(), true);

        return $code !== false ? strtoupper((string) $code) : null;
    }
}
