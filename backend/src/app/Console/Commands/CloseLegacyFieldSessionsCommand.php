<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Enums\FieldActivitySessionStatus;
use App\Models\FieldActivitySession;
use App\Services\FieldActivity\FieldActivitySessionService;
use Illuminate\Console\Command;

/**
 * One-off for the Field Trips release: clock-in no longer drives tracking, so
 * any clock-in session still running is closed properly (stops finalised,
 * summary built) at its last known position.
 */
class CloseLegacyFieldSessionsCommand extends Command
{
    protected $signature = 'field-activity:close-legacy-sessions {--dry-run}';

    protected $description = 'Close clock-in field sessions still active after the Field Trips release';

    public function handle(FieldActivitySessionService $sessions): int
    {
        $active = FieldActivitySession::query()
            ->where('source', FieldActivitySession::SOURCE_ATTENDANCE)
            ->where('status', FieldActivitySessionStatus::ACTIVE)
            ->get();

        foreach ($active as $session) {
            if (! $this->option('dry-run')) {
                $sessions->completeSession(
                    $session,
                    $session->last_recorded_at ?? now(),
                    autoClosed: true,
                    endReason: FieldActivitySession::END_REASON_AUTO_LEGACY,
                );
            }
        }

        $this->info(sprintf('%s %d clock-in session(s).', $this->option('dry-run') ? 'Would close' : 'Closed', $active->count()));

        return self::SUCCESS;
    }
}
