<?php

declare(strict_types=1);

namespace App\Support;

class LeadFieldNormalizer
{
    /**
     * @return list<string>
     */
    public static function normalizeProfileUrls(mixed $value): array
    {
        if ($value === null) {
            return [];
        }

        if (is_string($value)) {
            $value = array_map('trim', explode(',', $value));
        }

        if (! is_array($value)) {
            return [];
        }

        $urls = [];

        foreach ($value as $url) {
            if (! is_string($url)) {
                continue;
            }

            $normalized = self::normalizeWebsite($url);
            if ($normalized === null) {
                continue;
            }

            $urls[] = $normalized;
        }

        return array_values(array_unique($urls));
    }

    public static function normalizeWebsite(?string $website): ?string
    {
        if ($website === null) {
            return null;
        }

        $trimmed = trim($website);

        if ($trimmed === '') {
            return null;
        }

        // Phone numbers, emails, and free-text must never become websites.
        if (self::looksLikePhoneOrEmail($trimmed)) {
            return null;
        }

        if (! preg_match('/^https?:\/\//i', $trimmed)) {
            $trimmed = 'https://'.$trimmed;
        }

        if (filter_var($trimmed, FILTER_VALIDATE_URL) === false) {
            return null;
        }

        $host = parse_url($trimmed, PHP_URL_HOST);
        if (! is_string($host) || $host === '' || ! str_contains($host, '.')) {
            return null;
        }

        return $trimmed;
    }

    private static function looksLikePhoneOrEmail(string $value): bool
    {
        if (str_contains($value, '@') && filter_var($value, FILTER_VALIDATE_EMAIL)) {
            return true;
        }

        $digits = preg_replace('/\D+/', '', $value) ?? '';

        return strlen($digits) >= 7 && preg_match('/^[\d\s\-\+\(\)\.]+$/', $value) === 1;
    }

    /**
     * @return list<string>
     */
    public static function invalidProfileUrls(array $urls): array
    {
        $invalid = [];

        foreach ($urls as $url) {
            if (filter_var($url, FILTER_VALIDATE_URL) === false) {
                $invalid[] = $url;
            }
        }

        return $invalid;
    }

    public static function isValidWebsite(?string $website): bool
    {
        if ($website === null || trim($website) === '') {
            return true;
        }

        return filter_var($website, FILTER_VALIDATE_URL) !== false;
    }
}
