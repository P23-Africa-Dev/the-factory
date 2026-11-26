<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Enums\NotificationCategory;
use App\Enums\NotificationPriority;
use App\Models\FieldActivitySession;
use App\Models\FieldStop;
use App\Services\Notification\NotificationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * "You've stopped near … What are you doing here?" — one push per detected
 * stop on an active field trip, skipped when the person already recorded it.
 * Tapping it opens the quick-record card for that stop (/?stop={id}).
 */
class SendStopDetectedNotificationJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 2;

    public function __construct(public readonly int $stopId) {}

    public function handle(NotificationService $notifications): void
    {
        $stop = FieldStop::query()->find($this->stopId);
        if ($stop === null || $stop->record_status !== FieldStop::RECORD_PENDING) {
            return;
        }
        $trip = FieldActivitySession::query()->find($stop->field_activity_session_id);
        if ($trip === null || ! $trip->isFieldTrip() || ! $trip->isActive()) {
            return;
        }

        $place = trim((string) $stop->address);
        $notifications->notifyUser((int) $stop->user_id, [
            'company_id' => (int) $stop->company_id,
            'type' => 'field_trip.stop_detected',
            'category' => NotificationCategory::TRACKING->value,
            'title' => $place !== '' ? "You've stopped near ".mb_substr($place, 0, 80) : "You've stopped",
            'message' => 'What are you doing here? Tap to record it in a few seconds.',
            'reference_type' => FieldStop::class,
            'reference_id' => (int) $stop->id,
            'action_url' => '/?stop='.$stop->id,
            'action_route' => 'field-trip.stop',
            'priority' => NotificationPriority::NORMAL->value,
            'created_by_user_id' => null,
            'metadata' => [
                'field_stop_id' => (int) $stop->id,
                'field_activity_session_id' => (int) $trip->id,
            ],
            'dedupe_key' => 'field-trip-stop-detected:'.$stop->id,
        ]);
    }
}
