<?php

declare(strict_types=1);

namespace App\Support;

final class CurrencyCatalog
{
    /**
     * @return array<string, array{name:string, symbol:string}>
     */
    public static function supported(): array
    {
        $supported = config('currency.supported', []);
        if (! is_array($supported)) {
            return [];
        }

        $normalized = [];

        foreach ($supported as $code => $meta) {
            $normalizedCode = strtoupper((string) $code);
            if ($normalizedCode === '' || ! is_array($meta)) {
                continue;
            }

            $normalized[$normalizedCode] = [
                'name' => (string) ($meta['name'] ?? $normalizedCode),
                'symbol' => (string) ($meta['symbol'] ?? $normalizedCode),
            ];
        }

        return $normalized;
    }

    /**
     * @return array<int, string>
     */
    public static function codes(): array
    {
        return array_keys(self::supported());
    }

    public static function defaultCode(): string
    {
        $configured = strtoupper((string) config('currency.default', 'USD'));
        if (self::isSupported($configured)) {
            return $configured;
        }

        $codes = self::codes();

        return $codes[0] ?? 'USD';
    }

    public static function isSupported(?string $currency): bool
    {
        if (! $currency) {
            return false;
        }

        return array_key_exists(strtoupper($currency), self::supported());
    }

    public static function normalize(?string $currency, ?string $fallbackCurrency = null): string
    {
        $candidate = strtoupper((string) $currency);
        if ($candidate !== '' && self::isSupported($candidate)) {
            return $candidate;
        }

        $fallback = strtoupper((string) $fallbackCurrency);
        if ($fallback !== '' && self::isSupported($fallback)) {
            return $fallback;
        }

        return self::defaultCode();
    }

    /**
     * @return array<int, array{code:string, name:string, symbol:string, label:string}>
     */
    public static function asOptions(): array
    {
        $options = [];

        foreach (self::supported() as $code => $meta) {
            $options[] = [
                'code' => $code,
                'name' => (string) $meta['name'],
                'symbol' => (string) $meta['symbol'],
                'label' => sprintf('%s - %s', $code, (string) $meta['name']),
            ];
        }

        return $options;
    }
}
