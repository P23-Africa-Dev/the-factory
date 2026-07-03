<?php

/*
|--------------------------------------------------------------------------
| CORS Configuration
|--------------------------------------------------------------------------
| Restrict cross-origin access to approved frontend domains only.
| Set CORS_ALLOWED_ORIGINS env var to override (comma-separated list).
|
| Default allowed origins:
|   - https://thefactory23.com
|   - https://www.thefactory23.com
|
| Wildcard '*' is intentionally NOT allowed in production.
*/

$envOrigins = env('CORS_ALLOWED_ORIGINS');

$allowedOrigins = $envOrigins
    ? array_map('trim', explode(',', $envOrigins))
    : [
        'https://thefactory23.com',
        'https://www.thefactory23.com',
    ];

return [

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

    'allowed_origins' => $allowedOrigins,

    'allowed_origins_patterns' => [],

    'allowed_headers' => [
        'Content-Type',
        'Authorization',
        'Accept',
        'X-Requested-With',
        'X-XSRF-TOKEN',
    ],

    'exposed_headers' => [],

    'max_age' => 86400,

    // Must be false when using wildcard origins; true enables cookies/auth headers
    'supports_credentials' => false,

];
