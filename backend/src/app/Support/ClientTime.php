<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Support\Carbon;
use Throwable;

/**
 * Normalizes client-supplied timestamps into the application timezone.
 *
 * Clients send `recorded_at` in different shapes: the agent PWA sends UTC ISO
 * strings ("2026-08-10T15:00:02.000Z"), while the web dashboard sends naive
 * local wall time ("2026-08-10 16:00:02"). A bare Carbon::parse() keeps the
 * UTC instance as-is; Eloquent then stores its UTC wall time, which is later
 * re-read in the app timezone — shifting every timestamp by the UTC offset
 * and corrupting duration math (each interval gains the offset, e.g. +1h in
 * Africa/Lagos). Converting to the app timezone at the parse boundary makes
 * both input shapes land on the same, correct wall time.
 */
final class ClientTime
{
    /**
     * Parse a client timestamp into a Carbon instance in the app timezone.
     * Falls back to now() when the value is missing or unparseable.
     */
    public static function parse(mixed $value): Carbon
    {
        if ($value === null || $value === '') {
            return now();
        }

        try {
            return Carbon::parse((string) $value)->setTimezone(config('app.timezone'));
        } catch (Throwable) {
            return now();
        }
    }

    /**
     * Parse a client timestamp, returning null when the value is missing.
     */
    public static function parseOrNull(mixed $value): ?Carbon
    {
        if ($value === null || $value === '') {
            return null;
        }

        try {
            return Carbon::parse((string) $value)->setTimezone(config('app.timezone'));
        } catch (Throwable) {
            return null;
        }
    }
}
