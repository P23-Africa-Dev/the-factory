<?php

declare(strict_types=1);

return [
    // Distance thresholds for lifecycle transitions.
    'near_radius_meters' => (int) env('TASK_TRACKING_NEAR_RADIUS_METERS', 250),
    'arrival_radius_meters' => (int) env('TASK_TRACKING_ARRIVAL_RADIUS_METERS', 100),

    // Confidence gates to reduce false positives from noisy GPS fixes.
    'near_max_accuracy_meters' => (float) env('TASK_TRACKING_NEAR_MAX_ACCURACY_METERS', 150),
    'arrival_max_accuracy_meters' => (float) env('TASK_TRACKING_ARRIVAL_MAX_ACCURACY_METERS', 60),

    // Some devices/browsers never report GPS accuracy. When true, a null/unknown
    // accuracy is treated as acceptable (proximity then relies on distance +
    // movement gates) instead of permanently blocking near/arrival detection.
    'allow_unknown_accuracy' => (bool) env('TASK_TRACKING_ALLOW_UNKNOWN_ACCURACY', true),

    // Hysteresis multiplier: an un-arrived agent must move beyond
    // near_radius_meters * this factor before the "near" state resets, so a
    // fresh near notification can fire if they re-approach.
    'near_reset_hysteresis' => (float) env('TASK_TRACKING_NEAR_RESET_HYSTERESIS', 1.5),
    'min_movement_before_proximity_meters' => (float) env('TASK_TRACKING_MIN_MOVEMENT_BEFORE_PROXIMITY_METERS', 20),
    'min_seconds_between_near_and_arrival' => (int) env('TASK_TRACKING_MIN_SECONDS_BETWEEN_NEAR_AND_ARRIVAL', 10),

    'persist_min_interval_seconds' => (int) env('TASK_TRACKING_PERSIST_MIN_INTERVAL_SECONDS', 15),
    'persist_min_distance_meters' => (float) env('TASK_TRACKING_PERSIST_MIN_DISTANCE_METERS', 20),
    'agent_location_stale_after_seconds' => (int) env('TASK_TRACKING_AGENT_LOCATION_STALE_AFTER_SECONDS', 300),
    'session_stale_after_seconds' => (int) env('AGENT_SESSION_STALE_AFTER_SECONDS', 900),
    'delayed_eta_threshold_seconds' => (int) env('TASK_TRACKING_DELAYED_ETA_THRESHOLD_SECONDS', 1800),
    'max_batch_points' => (int) env('TASK_TRACKING_MAX_BATCH_POINTS', 50),
    'redis_channel_prefix' => (string) env('TASK_TRACKING_REDIS_CHANNEL_PREFIX', 'factory23.tracking'),
    'retention_days' => (int) env('TASK_TRACKING_RETENTION_DAYS', 90),
    'prune_chunk_size' => (int) env('TASK_TRACKING_PRUNE_CHUNK_SIZE', 1000),

    // Auto-close abandoned open sessions that have gone silent (mirrors field activity).
    'abandoned_session_after_seconds' => (int) env('TASK_TRACKING_ABANDONED_SESSION_AFTER_SECONDS', 21600), // 6h

    // Ops alert: tracking:health --fail-on-alert exits 1 when abandoned open sessions exceed this.
    'health_abandoned_alert_threshold' => (int) env('TASK_TRACKING_HEALTH_ABANDONED_ALERT_THRESHOLD', 50),

    // Anti-spoof / clock-skew guards for client-supplied recorded_at values.
    'max_recorded_at_future_skew_seconds' => (int) env('TASK_TRACKING_MAX_RECORDED_AT_FUTURE_SKEW_SECONDS', 120),
    'max_recorded_at_past_skew_seconds' => (int) env('TASK_TRACKING_MAX_RECORDED_AT_PAST_SKEW_SECONDS', 86400),
    'max_plausible_speed_mps' => (float) env('TASK_TRACKING_MAX_PLAUSIBLE_SPEED_MPS', 70),
    'teleport_grace_meters' => (float) env('TASK_TRACKING_TELEPORT_GRACE_METERS', 75),

    // Roles that can view the full company fleet on the live map / location APIs.
    'fleet_viewer_roles' => ['owner', 'admin', 'supervisor'],
];
