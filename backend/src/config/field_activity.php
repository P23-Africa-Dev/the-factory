<?php

declare(strict_types=1);

return [
    /*
    |--------------------------------------------------------------------------
    | Adaptive GPS client intervals
    |--------------------------------------------------------------------------
    */
    // 30s while moving keeps the live map continuous (matches the client's
    // 30s flush cadence); the persist gates below still cap trail density.
    'moving_interval_seconds' => (int) env('FIELD_ACTIVITY_MOVING_INTERVAL_SECONDS', 30),
    'stationary_interval_seconds' => (int) env('FIELD_ACTIVITY_STATIONARY_INTERVAL_SECONDS', 300),

    /*
    |--------------------------------------------------------------------------
    | Server persist gates (do not store every raw sample)
    |--------------------------------------------------------------------------
    */
    'persist_min_interval_seconds' => (int) env('FIELD_ACTIVITY_PERSIST_MIN_INTERVAL_SECONDS', 30),
    'persist_min_distance_meters' => (float) env('FIELD_ACTIVITY_PERSIST_MIN_DISTANCE_METERS', 20),
    'max_batch_points' => (int) env('FIELD_ACTIVITY_MAX_BATCH_POINTS', 50),

    // Cap on the interval credited between two consecutive points. Gaps
    // beyond this (device offline, app killed) are not counted as active time.
    'max_active_interval_seconds' => (int) env('FIELD_ACTIVITY_MAX_ACTIVE_INTERVAL_SECONDS', 900),

    /*
    |--------------------------------------------------------------------------
    | Movement classification
    |--------------------------------------------------------------------------
    | Speeds in km/h. Below stop_max_speed → stopped; below slow_max_speed → slow.
    */
    'stop_max_speed_kmh' => (float) env('FIELD_ACTIVITY_STOP_MAX_SPEED_KMH', 1.0),
    'slow_max_speed_kmh' => (float) env('FIELD_ACTIVITY_SLOW_MAX_SPEED_KMH', 8.0),

    /*
    |--------------------------------------------------------------------------
    | Stop detection
    |--------------------------------------------------------------------------
    */
    'stop_radius_meters' => (float) env('FIELD_ACTIVITY_STOP_RADIUS_METERS', 50),
    'stop_dwell_seconds' => (int) env('FIELD_ACTIVITY_STOP_DWELL_SECONDS', 300),
    'stop_reminder_seconds' => (int) env('FIELD_ACTIVITY_STOP_REMINDER_SECONDS', 1800),

    /*
    |--------------------------------------------------------------------------
    | Location intelligence (Release 2+)
    |--------------------------------------------------------------------------
    */
    'match_radius_meters' => (float) env('FIELD_ACTIVITY_MATCH_RADIUS_METERS', 75),
    'auto_classify_min_confidence' => (float) env('FIELD_ACTIVITY_AUTO_CLASSIFY_MIN_CONFIDENCE', 0.8),

    /*
    |--------------------------------------------------------------------------
    | End-of-day / alerts / retention
    |--------------------------------------------------------------------------
    */
    'eod_hour' => (int) env('FIELD_ACTIVITY_EOD_HOUR', 19),
    'long_stationary_alert_seconds' => (int) env('FIELD_ACTIVITY_LONG_STATIONARY_ALERT_SECONDS', 10800),
    'retention_days' => (int) env('FIELD_ACTIVITY_RETENTION_DAYS', 90),
    'prune_chunk_size' => (int) env('FIELD_ACTIVITY_PRUNE_CHUNK_SIZE', 1000),

    'redis_channel_prefix' => (string) env('FIELD_ACTIVITY_REDIS_CHANNEL_PREFIX', 'factory23.tracking'),
];
