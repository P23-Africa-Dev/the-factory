<?php

declare(strict_types=1);

return [
    'invite_ttl_hours' => (int) env('INTERNAL_ONBOARDING_INVITE_TTL_HOURS', 72),
    'frontend_onboarding_url' => env(
        'INTERNAL_ONBOARDING_FRONTEND_URL',
        rtrim((string) config('app.frontend_url', 'http://localhost:3000'), '/') . '/onboarding/internal',
    ),
    'default_currency' => env('INTERNAL_DEFAULT_CURRENCY', 'USD'),
    'avatar_storage_root' => env('INTERNAL_AVATAR_STORAGE_ROOT', 'avatar'),
    'default_avatar_path' => env('INTERNAL_DEFAULT_AVATAR_PATH', 'avatar/default/ghost.svg'),
    'avatar_public_base_url' => rtrim((string) env('INTERNAL_AVATAR_PUBLIC_BASE_URL', ''), '/'),
    'avatar_catalog' => [
        'male' => [
            'male_01' => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="60" cy="40" r="24" fill="#7CA8F8"/><rect x="25" y="70" width="70" height="35" rx="15" fill="#2F5CBE"/></svg>',
            'male_02' => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="60" cy="40" r="24" fill="#6FD3A7"/><rect x="25" y="70" width="70" height="35" rx="15" fill="#1B7F54"/></svg>',
            'male_03' => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="60" cy="40" r="24" fill="#F0A65A"/><rect x="25" y="70" width="70" height="35" rx="15" fill="#BD6B1F"/></svg>',
        ],
        'female' => [
            'female_01' => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="60" cy="40" r="24" fill="#E88CC5"/><rect x="25" y="70" width="70" height="35" rx="15" fill="#A23D7A"/></svg>',
            'female_02' => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="60" cy="40" r="24" fill="#7FC9E8"/><rect x="25" y="70" width="70" height="35" rx="15" fill="#2F789A"/></svg>',
            'female_03' => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="60" cy="40" r="24" fill="#F6B2A3"/><rect x="25" y="70" width="70" height="35" rx="15" fill="#BF5C49"/></svg>',
        ],
    ],
];
