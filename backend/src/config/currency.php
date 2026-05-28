<?php

declare(strict_types=1);

return [
    'default' => env('PAYROLL_DEFAULT_CURRENCY', env('INTERNAL_DEFAULT_CURRENCY', 'USD')),

    'supported' => [
        'USD' => [
            'name' => 'US Dollar',
            'symbol' => '$',
        ],
        'GBP' => [
            'name' => 'British Pound',
            'symbol' => 'GBP',
        ],
        'CAD' => [
            'name' => 'Canadian Dollar',
            'symbol' => 'CA$',
        ],
        'NGN' => [
            'name' => 'Nigerian Naira',
            'symbol' => 'NGN',
        ],
        'EUR' => [
            'name' => 'Euro',
            'symbol' => 'EUR',
        ],
        'AED' => [
            'name' => 'UAE Dirham',
            'symbol' => 'AED',
        ],
        'KES' => [
            'name' => 'Kenyan Shilling',
            'symbol' => 'KSh',
        ],
        'ZAR' => [
            'name' => 'South African Rand',
            'symbol' => 'R',
        ],
        'GHS' => [
            'name' => 'Ghanaian Cedi',
            'symbol' => 'GHS',
        ],
    ],
];
