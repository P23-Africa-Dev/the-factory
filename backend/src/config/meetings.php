<?php

declare(strict_types=1);

return [
    'deletion_mode' => env('MEETING_DELETION_MODE', 'soft'),
    'reminders' => [
        // Requeue reminder rows that are stuck in queued state beyond this threshold.
        'stale_queue_minutes' => (int) env('MEETING_REMINDER_STALE_QUEUE_MINUTES', 15),
    ],
];
