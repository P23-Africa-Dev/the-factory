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

            $trimmed = trim($url);

            if ($trimmed === '') {
                continue;
            }

            $urls[] = $trimmed;
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

        if (! preg_match('/^https?:\/\//i', $trimmed)) {
            $trimmed = 'https://' . $trimmed;
        }

        return $trimmed;
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
