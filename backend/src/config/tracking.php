<?php

declare(strict_types=1);

return [
    // Distance thresholds for lifecycle transitions.
    'near_radius_meters' => (int) env('TASK_TRACKING_NEAR_RADIUS_METERS', 250),
    'arrival_radius_meters' => (int) env('TASK_TRACKING_ARRIVAL_RADIUS_METERS', 100),

    // Confidence gates to reduce false positives from noisy GPS fixes.
    'near_max_accuracy_meters' => (float) env('TASK_TRACKING_NEAR_MAX_ACCURACY_METERS', 150),
    'arrival_max_accuracy_meters' => (float) env('TASK_TRACKING_ARRIVAL_MAX_ACCURACY_METERS', 60),
    'min_movement_before_proximity_meters' => (float) env('TASK_TRACKING_MIN_MOVEMENT_BEFORE_PROXIMITY_METERS', 20),
    'min_seconds_between_near_and_arrival' => (int) env('TASK_TRACKING_MIN_SECONDS_BETWEEN_NEAR_AND_ARRIVAL', 10),

    'persist_min_interval_seconds' => (int) env('TASK_TRACKING_PERSIST_MIN_INTERVAL_SECONDS', 15),
    'persist_min_distance_meters' => (float) env('TASK_TRACKING_PERSIST_MIN_DISTANCE_METERS', 20),
    'agent_location_stale_after_seconds' => (int) env('TASK_TRACKING_AGENT_LOCATION_STALE_AFTER_SECONDS', 300),
    'delayed_eta_threshold_seconds' => (int) env('TASK_TRACKING_DELAYED_ETA_THRESHOLD_SECONDS', 1800),
    'max_batch_points' => (int) env('TASK_TRACKING_MAX_BATCH_POINTS', 50),
    'redis_channel_prefix' => (string) env('TASK_TRACKING_REDIS_CHANNEL_PREFIX', 'factory23.tracking'),
    'retention_days' => (int) env('TASK_TRACKING_RETENTION_DAYS', 90),
    'prune_chunk_size' => (int) env('TASK_TRACKING_PRUNE_CHUNK_SIZE', 1000),
];
