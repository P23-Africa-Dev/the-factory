<?php

return [
    'activation_link_ttl_minutes' => (int) env('ENTERPRISE_ACTIVATION_LINK_TTL_MINUTES', 10080),
    'notification_email' => env('ENTERPRISE_DEMO_NOTIFICATION_EMAIL', env('ADMIN_DEFAULT_EMAIL')),
    'company_id_prefix' => env('ENTERPRISE_COMPANY_ID_PREFIX', 'FAC'),
    'frontend_url' => env('FRONTEND_URL', 'https://thefactory23.com'),
    'onboarding_setup_path' => env('ENTERPRISE_ONBOARDING_SETUP_PATH', '/enterprise/setup'),
    'onboarding_setup_url' => env('ENTERPRISE_ONBOARDING_SETUP_URL'),
];