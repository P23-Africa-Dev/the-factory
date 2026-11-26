<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Services\FieldActivity\FieldStopDetectionService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/** Reverse geocode / place / CRM matching for stops closed at trip end. */
class EnrichFieldStopsJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 3;

    /**
     * @param  list<int>  $stopIds
     */
    public function __construct(public readonly array $stopIds) {}

    public function handle(FieldStopDetectionService $detection): void
    {
        $detection->enrichStops($this->stopIds);
    }
}
