<?php

$frontendUrl = rtrim((string) env('FRONTEND_URL', 'https://thefactory23.com'), '/');

return [
    'name' => 'Factory23',
    'team' => 'The Factory23 Team',
    'security_team' => 'The Factory23 Security Team',
    'support_email' => 'support@thefactory23.com',
    'website_url' => $frontendUrl,
    'logo_url' => $frontendUrl.'/brand/factory23-logo.png',
    'privacy_url' => $frontendUrl.'/files/Factory23%20Privacy%20Policy.pdf',
    'terms_url' => $frontendUrl.'/files/Factory23%20Terms%20of%20Service.pdf',
    'colors' => [
        'page_background' => '#F4F7FB',
        'card_background' => '#FFFFFF',
        'card_border' => '#E2E8F0',
        'header' => '#0A1D25',
        'cta' => '#0B1215',
        'text' => '#334155',
        'muted' => '#64748B',
        'footer_background' => '#F8FAFC',
    ],
];
