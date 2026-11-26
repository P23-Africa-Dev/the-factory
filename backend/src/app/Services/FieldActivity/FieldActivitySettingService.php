<?php

declare(strict_types=1);

namespace App\Services\FieldActivity;

use App\Models\Company;

class FieldActivitySettingService
{
    /** Allowed ranges, in seconds (admins pick from presets; the API clamps). */
    public const STOP_DWELL_MIN = 60;
    public const STOP_DWELL_MAX = 3600;
    public const REMINDER_MIN = 1800;
    public const REMINDER_MAX = 86400;
    public const AUTO_END_MIN = 1800;
    public const AUTO_END_MAX = 86400;

    public function isEnabledForCompany(Company $company): bool
    {
        return (bool) ($company->field_activity_enabled ?? false);
    }

    public function setEnabled(Company $company, bool $enabled): void
    {
        $wasEnabled = $this->isEnabledForCompany($company);
        $company->forceFill(['field_activity_enabled' => $enabled])->save();

        // Turning Field Activity off ends running trips cleanly instead of
        // leaving them active (points would be refused and they would never
        // finalize). Resolved lazily: the trip service depends on this one.
        if ($wasEnabled && ! $enabled) {
            app(FieldTripService::class)->endAllForCompany($company);
        }
    }

    /** Time in one place before it counts as a stop (company setting, default 5 min). */
    public function stopDwellSeconds(?Company $company): int
    {
        $value = (int) ($company?->field_stop_dwell_seconds ?? 0);

        return $value > 0
            ? $this->clamp($value, self::STOP_DWELL_MIN, self::STOP_DWELL_MAX)
            : (int) config('field_activity.stop_dwell_seconds', 300);
    }

    /** "Still on your field trip?" reminder interval (default 5 h, repeats). */
    public function tripReminderSeconds(?Company $company): int
    {
        $value = (int) ($company?->field_trip_reminder_seconds ?? 0);

        return $value > 0 ? $this->clamp($value, self::REMINDER_MIN, self::REMINDER_MAX) : 18000;
    }

    /** End a trip automatically after this long with no location (default 2 h). */
    public function tripAutoEndSeconds(?Company $company): int
    {
        $value = (int) ($company?->field_trip_auto_end_seconds ?? 0);

        return $value > 0 ? $this->clamp($value, self::AUTO_END_MIN, self::AUTO_END_MAX) : 7200;
    }

    /** 'required': finish the last trip's report before starting a new trip; 'optional': reminders only. */
    public function tripReportPolicy(?Company $company): string
    {
        $value = (string) ($company?->field_trip_report_policy ?? '');

        return in_array($value, ['required', 'optional'], true) ? $value : 'required';
    }

    /**
     * @param  array<string, mixed>  $values  any of stop_dwell_seconds, trip_reminder_seconds, trip_auto_end_seconds, trip_report_policy
     */
    public function updateTripSettings(Company $company, array $values): void
    {
        $fill = [];
        if (isset($values['stop_dwell_seconds'])) {
            $fill['field_stop_dwell_seconds'] = $this->clamp((int) $values['stop_dwell_seconds'], self::STOP_DWELL_MIN, self::STOP_DWELL_MAX);
        }
        if (isset($values['trip_reminder_seconds'])) {
            $fill['field_trip_reminder_seconds'] = $this->clamp((int) $values['trip_reminder_seconds'], self::REMINDER_MIN, self::REMINDER_MAX);
        }
        if (isset($values['trip_auto_end_seconds'])) {
            $fill['field_trip_auto_end_seconds'] = $this->clamp((int) $values['trip_auto_end_seconds'], self::AUTO_END_MIN, self::AUTO_END_MAX);
        }
        if (isset($values['trip_report_policy']) && in_array($values['trip_report_policy'], ['required', 'optional'], true)) {
            $fill['field_trip_report_policy'] = $values['trip_report_policy'];
        }

        if ($fill !== []) {
            $company->forceFill($fill)->save();
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function serialize(Company $company): array
    {
        return [
            'enabled' => $this->isEnabledForCompany($company),
            'company_id' => $company->id,
            'stop_dwell_seconds' => $this->stopDwellSeconds($company),
            'trip_reminder_seconds' => $this->tripReminderSeconds($company),
            'trip_auto_end_seconds' => $this->tripAutoEndSeconds($company),
            'trip_report_policy' => $this->tripReportPolicy($company),
        ];
    }

    private function clamp(int $value, int $min, int $max): int
    {
        return max($min, min($max, $value));
    }
}
