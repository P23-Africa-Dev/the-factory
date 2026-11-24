<?php

declare(strict_types=1);

return [
    'default' => env('PAYROLL_DEFAULT_CURRENCY', env('INTERNAL_DEFAULT_CURRENCY', 'GBP')),

    'supported' => [
        'GBP' => [
            'name' => 'British Pound',
            'symbol' => 'GBP',
        ],
        'USD' => [
            'name' => 'US Dollar',
            'symbol' => '$',
        ],
        'CAD' => [
            'name' => 'Canadian Dollar',
            'symbol' => 'CA$',
        ],
        'EUR' => [
            'name' => 'Euro',
            'symbol' => 'EUR',
        ],
        'NGN' => [
            'name' => 'Nigerian Naira',
            'symbol' => 'NGN',
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
