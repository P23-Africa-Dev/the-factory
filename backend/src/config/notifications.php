<?php

return [
    'redis_channel_prefix' => env('NOTIFICATIONS_REDIS_CHANNEL_PREFIX', 'factory23.notifications'),

    'push' => [
        'provider' => env('NOTIFICATIONS_PUSH_PROVIDER', 'log'),
        'max_failed_attempts_before_deactivate' => (int) env('NOTIFICATIONS_PUSH_MAX_FAILED_ATTEMPTS', 5),
    ],

    'scheduling' => [
        'due_soon_threshold_minutes' => (int) env('NOTIFICATIONS_TASK_DUE_SOON_THRESHOLD_MINUTES', 120),
    ],
];
