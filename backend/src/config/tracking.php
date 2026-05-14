<?php

declare(strict_types=1);

return [
    'arrival_radius_meters' => (int) env('TASK_TRACKING_ARRIVAL_RADIUS_METERS', 75),
    'persist_min_interval_seconds' => (int) env('TASK_TRACKING_PERSIST_MIN_INTERVAL_SECONDS', 15),
    'persist_min_distance_meters' => (float) env('TASK_TRACKING_PERSIST_MIN_DISTANCE_METERS', 20),
    'max_batch_points' => (int) env('TASK_TRACKING_MAX_BATCH_POINTS', 50),
    'redis_channel_prefix' => (string) env('TASK_TRACKING_REDIS_CHANNEL_PREFIX', 'factory23.tracking'),
    'retention_days' => (int) env('TASK_TRACKING_RETENTION_DAYS', 90),
    'prune_chunk_size' => (int) env('TASK_TRACKING_PRUNE_CHUNK_SIZE', 1000),
];
