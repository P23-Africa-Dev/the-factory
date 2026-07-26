<?php

declare(strict_types=1);

return [
    /*
    |--------------------------------------------------------------------------
    | Places Search Platform
    |--------------------------------------------------------------------------
    | Provider order is always: Geoapify → Foursquare → Google (final fallback).
    | Mapbox is intentionally NOT a search provider (maps/routing only).
    */

    'cache_enabled' => (bool) env('PLACES_CACHE_ENABLED', true),
    'fallback_enabled' => (bool) env('PLACES_FALLBACK_ENABLED', true),

    'quality_threshold' => (float) env('PLACES_QUALITY_THRESHOLD', 0.80),
    'min_results' => (int) env('PLACES_MIN_RESULTS', 1),
    'min_nearby_results' => (int) env('PLACES_MIN_NEARBY_RESULTS', 3),

    'store_truncated_query' => (bool) env('PLACES_STORE_TRUNCATED_QUERY', false),

    'google_daily_budget' => (int) env('PLACES_GOOGLE_DAILY_BUDGET', 200),

    'ttl' => [
        'autocomplete' => (int) env('PLACES_TTL_AUTOCOMPLETE', 180),
        'search' => (int) env('PLACES_TTL_SEARCH', 1800),
        'nearby' => (int) env('PLACES_TTL_NEARBY', 1800),
        'details' => (int) env('PLACES_TTL_DETAILS', 86400),
        'geocode' => (int) env('PLACES_TTL_GEOCODE', 86400),
        'reverse' => (int) env('PLACES_TTL_REVERSE', 86400),
    ],

    'timeouts' => [
        'geoapify' => (float) env('PLACES_TIMEOUT_GEOAPIFY', 2.0),
        'foursquare' => (float) env('PLACES_TIMEOUT_FOURSQUARE', 2.0),
        'google' => (float) env('PLACES_TIMEOUT_GOOGLE', 2.5),
    ],

    'providers' => [
        'geoapify' => [
            'enabled' => (bool) env('PLACES_GEOAPIFY_ENABLED', true),
            'api_key' => env('GEOAPIFY_API_KEY'),
            'base_url' => env('GEOAPIFY_BASE_URL', 'https://api.geoapify.com'),
            'credit_units' => (float) env('PLACES_GEOAPIFY_CREDIT_UNITS', 1.0),
        ],
        'foursquare' => [
            'enabled' => (bool) env('PLACES_FOURSQUARE_ENABLED', true),
            'api_key' => env('FOURSQUARE_API_KEY'),
            'base_url' => env('FOURSQUARE_BASE_URL', 'https://api.foursquare.com/v3'),
            'credit_units' => (float) env('PLACES_FOURSQUARE_CREDIT_UNITS', 1.2),
        ],
        'google' => [
            'enabled' => (bool) env('PLACES_GOOGLE_ENABLED', true),
            'api_key' => env('GOOGLE_PLACES_API_KEY', env('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY')),
            'base_url' => env('GOOGLE_PLACES_BASE_URL', 'https://places.googleapis.com/v1'),
            'credit_units' => (float) env('PLACES_GOOGLE_CREDIT_UNITS', 2.5),
        ],
    ],

    /** Estimated USD per call (dashboard only — not invoices). */
    'cost_estimates_usd' => [
        'geoapify' => [
            'autocomplete' => 0.0005,
            'search' => 0.0005,
            'nearby' => 0.001,
            'details' => 0.0005,
            'geocode' => 0.0005,
            'reverse' => 0.0005,
        ],
        'foursquare' => [
            'autocomplete' => 0.001,
            'search' => 0.002,
            'nearby' => 0.002,
            'details' => 0.002,
            'geocode' => 0.0,
            'reverse' => 0.0,
        ],
        'google' => [
            'autocomplete' => 0.00283,
            'search' => 0.032,
            'nearby' => 0.032,
            'details' => 0.005,
            'geocode' => 0.005,
            'reverse' => 0.005,
        ],
    ],
];
