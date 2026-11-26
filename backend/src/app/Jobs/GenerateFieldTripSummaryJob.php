<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Models\FieldActivitySession;
use App\Services\FieldActivity\FieldTripSummaryService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/** ELY trip summary after a report is submitted or edited (one at a time per trip). */
class GenerateFieldTripSummaryJob implements ShouldQueue, ShouldBeUnique
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 2;
    public int $uniqueFor = 60;

    public function __construct(public readonly int $tripId) {}

    public function uniqueId(): string
    {
        return 'field-trip-summary:'.$this->tripId;
    }

    public function handle(FieldTripSummaryService $summaries): void
    {
        $trip = FieldActivitySession::query()->find($this->tripId);
        if ($trip !== null && $trip->isFieldTrip()) {
            $summaries->generate($trip);
        }
    }
}
