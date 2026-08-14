<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\FieldActivitySession;
use App\Models\FieldStop;
use App\Services\FieldActivity\FieldStopDetectionService;
use Illuminate\Console\Command;

class RedetectFieldStopsCommand extends Command
{
    protected $signature = 'field-activity:redetect-stops
                            {--session= : Only reprocess this field_activity_session id}
                            {--from= : Started-at date (Y-m-d), inclusive}
                            {--to= : Started-at date (Y-m-d), inclusive}';

    protected $description = 'Re-run stop detection on field activity sessions (does not delete already-classified stops).';

    public function handle(FieldStopDetectionService $detector): int
    {
        $query = FieldActivitySession::query()->orderBy('id');

        if ($this->option('session') !== null) {
            $query->where('id', (int) $this->option('session'));
        }
        if (is_string($this->option('from')) && $this->option('from') !== '') {
            $query->whereDate('started_at', '>=', $this->option('from'));
        }
        if (is_string($this->option('to')) && $this->option('to') !== '') {
            $query->whereDate('started_at', '<=', $this->option('to'));
        }

        $processed = 0;
        $createdBefore = FieldStop::query()->count();

        $query->chunkById(50, function ($sessions) use ($detector, &$processed): void {
            foreach ($sessions as $session) {
                $hadClassified = FieldStop::query()
                    ->where('field_activity_session_id', $session->id)
                    ->whereNotNull('classified_by')
                    ->exists();

                if ($hadClassified) {
                    $detector->processSession($session);
                } else {
                    FieldStop::query()
                        ->where('field_activity_session_id', $session->id)
                        ->delete();
                    $detector->processSession($session);
                    if ($session->ended_at !== null) {
                        $detector->finalizeOpenStops($session, $session->ended_at);
                    }
                }

                $processed++;
            }
        });

        $createdAfter = FieldStop::query()->count();
        $this->info("sessions={$processed} stops_delta=" . ($createdAfter - $createdBefore));

        return self::SUCCESS;
    }
}
