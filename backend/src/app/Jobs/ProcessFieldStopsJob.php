<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Models\FieldActivitySession;
use App\Services\FieldActivity\FieldActivitySessionService;
use App\Services\FieldActivity\FieldStopDetectionService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUniqueUntilProcessing;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;

/**
 * Stop detection for an active field trip, off the ingest request.
 *
 * Detection runs under a lock on the session row (ingest and End take the same
 * lock), resuming from the session's scan cursor. Enrichment (reverse
 * geocode, places, CRM matching) runs afterwards, outside the lock.
 *
 * Unique per session until it starts: a burst of ingests queues one run,
 * and an ingest arriving while it runs queues the next.
 */
class ProcessFieldStopsJob implements ShouldQueue, ShouldBeUniqueUntilProcessing
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 3;

    public int $uniqueFor = 120;

    public function __construct(public readonly int $sessionId) {}

    public function uniqueId(): string
    {
        return 'field-stops:'.$this->sessionId;
    }

    public function handle(FieldStopDetectionService $detection, FieldActivitySessionService $sessions): void
    {
        $affected = DB::transaction(function () use ($detection): array {
            $session = FieldActivitySession::query()->lockForUpdate()->find($this->sessionId);
            // Ended sessions were finalized by completeSession under the same lock.
            if ($session === null || ! $session->isActive()) {
                return [];
            }

            return $detection->processSession($session);
        });

        $detection->enrichStops($affected);

        $session = FieldActivitySession::query()->find($this->sessionId);
        if ($session !== null && $session->isActive()) {
            $sessions->sendStopReminders($session);
        }
    }
}
