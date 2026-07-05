<?php

declare(strict_types=1);

return [
    'company_public_ids' => array_values(array_filter(array_map(
        'trim',
        explode(',', (string) env('DEMO_COMPANY_PUBLIC_IDS', 'FAC-DEMOLDN1,FAC-DEMOLAG1')),
    ))),

    'ai_unlimited' => (bool) env('DEMO_AI_UNLIMITED', true),

    'tracking_simulation_interval_seconds' => (int) env('DEMO_TRACKING_SIMULATION_INTERVAL_SECONDS', 8),

    'tracking_simulation_steps' => (int) env('DEMO_TRACKING_SIMULATION_STEPS', 16),

    'tracking_start_offset_km' => (float) env('DEMO_TRACKING_START_OFFSET_KM', 2.0),

    'auto_complete_tracking' => (bool) env('DEMO_AUTO_COMPLETE_TRACKING', false),

    'geocode_centroids' => [
        'GB' => ['latitude' => 51.5074, 'longitude' => -0.1278, 'place_name' => 'London, UK'],
        'NG' => ['latitude' => 6.5244, 'longitude' => 3.3792, 'place_name' => 'Lagos, Nigeria'],
        'DEFAULT' => ['latitude' => 51.5074, 'longitude' => -0.1278, 'place_name' => 'Demo location'],
    ],
];
