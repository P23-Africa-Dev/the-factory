<?php

return [
    'brand' => env('ADMIN_BRAND', 'Factory Admin'),
    'users_per_page' => (int) env('ADMIN_USERS_PER_PAGE', 20),
    'seed' => [
        'default_name' => env('ADMIN_DEFAULT_NAME', 'Platform Admin'),
        'default_email' => env('ADMIN_DEFAULT_EMAIL'),
        'default_password' => env('ADMIN_DEFAULT_PASSWORD'),
        'default_role' => env('ADMIN_DEFAULT_ROLE', 'super_admin'),
    ],
    'modules' => [
        'dashboard' => true,
        'users' => true,
    ],
];
