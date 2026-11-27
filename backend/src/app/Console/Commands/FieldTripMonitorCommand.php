<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\FieldActivity\FieldTripService;
use Illuminate\Console\Command;

/**
 * Field trip upkeep: long-trip reminders (default every 5 h), a one-time
 * "we lost your location" push after 10 min of silence, and auto-end after the
 * company's no-location limit (default 2 h). Never tied to the work day.
 */
class FieldTripMonitorCommand extends Command
{
    protected $signature = 'field-trips:monitor';

    protected $description = 'Remind, flag lost signal and auto-end silent field trips';

    public function handle(FieldTripService $trips): int
    {
        $result = $trips->monitor();

        $this->info(sprintf(
            'Field trips: %d reminded, %d signal-lost, %d auto-ended, %d report reminders.',
            $result['reminded'],
            $result['signal_lost'],
            $result['auto_ended'],
            $result['report_reminded'] ?? 0,
        ));

        return self::SUCCESS;
    }
}
