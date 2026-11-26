<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\AttendanceSetting;
use App\Models\Company;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use DateTimeZone;
use Throwable;

/**
 * "Today" and day boundaries in the company's own time zone
 * (AttendanceSetting.timezone, default Africa/Lagos).
 *
 * Storage is unchanged: timestamps stay in the app time zone, so every
 * boundary returned here is converted back to the app time zone before it
 * is used in a query.
 */
final class CompanyClock
{
    public const DEFAULT_TIMEZONE = 'Africa/Lagos';

    public static function timezone(Company|int|null $company): string
    {
        $companyId = $company instanceof Company ? (int) $company->id : (int) ($company ?? 0);
        if ($companyId <= 0) {
            return self::DEFAULT_TIMEZONE;
        }

        $tz = AttendanceSetting::query()->where('company_id', $companyId)->value('timezone');

        return self::validTimezone(is_string($tz) ? trim($tz) : '');
    }

    public static function now(Company|int|null $company): Carbon
    {
        return now(self::timezone($company));
    }

    /** Today's date (Y-m-d) in the company time zone. */
    public static function today(Company|int|null $company): string
    {
        return self::now($company)->toDateString();
    }

    /** Company-local date (Y-m-d) of a stored timestamp. */
    public static function dateOf(CarbonInterface|string|null $at, Company|int|null $company): ?string
    {
        if ($at === null || $at === '') {
            return null;
        }
        $instant = $at instanceof CarbonInterface ? Carbon::instance($at) : Carbon::parse($at);

        return $instant->copy()->setTimezone(self::timezone($company))->toDateString();
    }

    /**
     * Start and end of a company-local day, in the app time zone (for queries).
     *
     * @return array{0: Carbon, 1: Carbon}
     */
    public static function dayBounds(Company|int|null $company, ?string $date = null): array
    {
        return self::rangeBounds($company, $date, $date);
    }

    /**
     * From the start of $from to the end of $to (company-local dates), in the app time zone.
     *
     * @return array{0: Carbon, 1: Carbon}
     */
    public static function rangeBounds(Company|int|null $company, ?string $from, ?string $to): array
    {
        $tz = self::timezone($company);
        $appTz = (string) config('app.timezone', 'UTC');
        $today = now($tz)->toDateString();

        $start = Carbon::parse(self::dateString($from) ?? $today, $tz)->startOfDay();
        $end = Carbon::parse(self::dateString($to) ?? $today, $tz)->endOfDay();
        if ($end->lt($start)) {
            [$start, $end] = [$end->copy()->startOfDay(), $start->copy()->endOfDay()];
        }

        return [$start->setTimezone($appTz), $end->setTimezone($appTz)];
    }

    private static function dateString(?string $value): ?string
    {
        if ($value === null || trim($value) === '') {
            return null;
        }

        try {
            return Carbon::parse($value)->toDateString();
        } catch (Throwable) {
            return null;
        }
    }

    private static function validTimezone(string $tz): string
    {
        if ($tz === '') {
            return self::DEFAULT_TIMEZONE;
        }

        try {
            new DateTimeZone($tz);

            return $tz;
        } catch (Throwable) {
            return self::DEFAULT_TIMEZONE;
        }
    }
}
