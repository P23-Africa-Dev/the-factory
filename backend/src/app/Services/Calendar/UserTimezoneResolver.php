<?php

declare(strict_types=1);

namespace App\Services\Calendar;

use DateTimeZone;

final class UserTimezoneResolver
{
    /**
     * @var array<string, string>
     */
    private const COUNTRY_TIMEZONE_MAP = [
        'NG' => 'Africa/Lagos',
        'GH' => 'Africa/Accra',
        'KE' => 'Africa/Nairobi',
        'ZA' => 'Africa/Johannesburg',
        'EG' => 'Africa/Cairo',
        'GB' => 'Europe/London',
        'FR' => 'Europe/Paris',
        'DE' => 'Europe/Berlin',
        'US' => 'America/New_York',
        'CA' => 'America/Toronto',
        'IN' => 'Asia/Kolkata',
        'AE' => 'Asia/Dubai',
        'SG' => 'Asia/Singapore',
        'JP' => 'Asia/Tokyo',
        'AU' => 'Australia/Sydney',
    ];

    public function resolve(?string $clientTimezone = null, ?string $companyCountry = null): string
    {
        $normalizedClientTimezone = $this->normalizeTimezone($clientTimezone);
        if ($normalizedClientTimezone !== null) {
            return $normalizedClientTimezone;
        }

        $countryTimezone = $this->timezoneFromCountry($companyCountry);
        if ($countryTimezone !== null) {
            return $countryTimezone;
        }

        $appTimezone = $this->normalizeTimezone((string) config('app.timezone', 'UTC'));

        return $appTimezone ?? 'UTC';
    }

    public function normalizeTimezone(?string $timezone): ?string
    {
        if (! is_string($timezone)) {
            return null;
        }

        $candidate = trim($timezone);
        if ($candidate === '') {
            return null;
        }

        try {
            new DateTimeZone($candidate);
        } catch (\Throwable) {
            return null;
        }

        return $candidate;
    }

    private function timezoneFromCountry(?string $country): ?string
    {
        if (! is_string($country)) {
            return null;
        }

        $code = strtoupper(trim($country));

        return self::COUNTRY_TIMEZONE_MAP[$code] ?? null;
    }
}
