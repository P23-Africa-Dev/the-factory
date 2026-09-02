<?php

declare(strict_types=1);

return [
    'company_public_ids' => array_values(array_filter(array_map(
        'trim',
        explode(',', (string) env('DEMO_COMPANY_PUBLIC_IDS', 'FAC-DEMOLDN1,FAC-DEMOLAG1,FAC-DEMOAFR1')),
    ))),

    'ai_unlimited' => (bool) env('DEMO_AI_UNLIMITED', true),

    'tracking_simulation_interval_seconds' => (int) env('DEMO_TRACKING_SIMULATION_INTERVAL_SECONDS', 8),

    'tracking_simulation_steps' => (int) env('DEMO_TRACKING_SIMULATION_STEPS', 16),

    'tracking_start_offset_km' => (float) env('DEMO_TRACKING_START_OFFSET_KM', 2.0),

    'auto_complete_tracking' => (bool) env('DEMO_AUTO_COMPLETE_TRACKING', false),

    // MySQL TIMESTAMP columns cannot store values beyond 2038-01-19.
    'grace_ends_at' => (string) env('DEMO_GRACE_ENDS_AT', '2038-01-01 00:00:00'),

    'geocode_centroids' => [
        'GB' => ['latitude' => 51.5074, 'longitude' => -0.1278, 'place_name' => 'London, UK'],
        'NG' => ['latitude' => 6.5244, 'longitude' => 3.3792, 'place_name' => 'Lagos, Nigeria'],
        'GH' => ['latitude' => 5.6037, 'longitude' => -0.1870, 'place_name' => 'Accra, Ghana'],
        'ZA' => ['latitude' => -26.2041, 'longitude' => 28.0473, 'place_name' => 'Johannesburg, South Africa'],
        'KE' => ['latitude' => -1.2864, 'longitude' => 36.8172, 'place_name' => 'Nairobi, Kenya'],
        'DEFAULT' => ['latitude' => 51.5074, 'longitude' => -0.1278, 'place_name' => 'Demo location'],
    ],
];
