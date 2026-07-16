<?php

declare(strict_types=1);

return [

    'enforce' => (bool) env('BILLING_ENFORCE', true),

    'currency' => env('BILLING_CURRENCY', 'usd'),

    'grace_period_days' => (int) env('BILLING_GRACE_PERIOD_DAYS', 7),

    'reminder_days_before_expiry' => array_map(
        'intval',
        explode(',', (string) env('BILLING_REMINDER_DAYS', '7,5,3,1')),
    ),

    'grace_reminder_days' => array_map(
        'intval',
        explode(',', (string) env('BILLING_GRACE_REMINDER_DAYS', '5,3,1')),
    ),

    'payment_link_ttl_hours' => (int) env('BILLING_PAYMENT_LINK_TTL_HOURS', 168),

    'enforce_in_tests' => (bool) env('BILLING_ENFORCE_IN_TESTS', false),

    'frontend_url' => env('FRONTEND_URL', env('APP_URL', 'http://localhost:3000')),

    /*
    |--------------------------------------------------------------------------
    | Map Credits
    |--------------------------------------------------------------------------
    |
    | Google (map) API usage is metered against credits allocated to each
    | organization. These are fallbacks; the live values are stored as
    | platform settings and are editable by the super admin.
    |
    |   credit_allocation_percent  % of a plan's MONTHLY price granted as
    |                              credits each billing cycle (e.g. 5% of a
    |                              $99 plan = $4.95 = 495 credits).
    |   credits_per_usd            Conversion rate (100 credits = $1).
    |   low_credit_threshold_percent  Balance below this % of the monthly
    |                              allocation triggers the low-credit prompt.
    |   credit_enforce             Master switch for hard-blocking Google calls
    |                              once credits run out.
    |
    */

    'credit_allocation_percent' => (float) env('MAP_CREDIT_ALLOCATION_PERCENT', 5),

    'credits_per_usd' => (float) env('MAP_CREDITS_PER_USD', 100),

    'low_credit_threshold_percent' => (float) env('MAP_CREDIT_LOW_THRESHOLD_PERCENT', 15),

    'credit_enforce' => (bool) env('MAP_CREDIT_ENFORCE', true),

    'plans' => [
        'up_to_5' => [
            'label' => 'Up to 5 users',
            'seat_limit' => 5,
            'monthly_amount' => 9900,
            'annual_amount' => 99000,
            'monthly_price_id' => env('STRIPE_PRICE_UP_TO_5_MONTHLY'),
            'annual_price_id' => env('STRIPE_PRICE_UP_TO_5_ANNUAL'),
        ],
        'up_to_10' => [
            'label' => 'Up to 10 users',
            'seat_limit' => 10,
            'monthly_amount' => 19900,
            'annual_amount' => 199000,
            'monthly_price_id' => env('STRIPE_PRICE_UP_TO_10_MONTHLY'),
            'annual_price_id' => env('STRIPE_PRICE_UP_TO_10_ANNUAL'),
        ],
        'up_to_15' => [
            'label' => 'Up to 15 users',
            'seat_limit' => 15,
            'monthly_amount' => 27900,
            'annual_amount' => 279000,
            'monthly_price_id' => env('STRIPE_PRICE_UP_TO_15_MONTHLY'),
            'annual_price_id' => env('STRIPE_PRICE_UP_TO_15_ANNUAL'),
        ],
        'up_to_20' => [
            'label' => 'Up to 20 users',
            'seat_limit' => 20,
            'monthly_amount' => 31900,
            'annual_amount' => 319000,
            'monthly_price_id' => env('STRIPE_PRICE_UP_TO_20_MONTHLY'),
            'annual_price_id' => env('STRIPE_PRICE_UP_TO_20_ANNUAL'),
        ],
        'up_to_25' => [
            'label' => 'Up to 25 users',
            'seat_limit' => 25,
            'monthly_amount' => 38900,
            'annual_amount' => 389000,
            'monthly_price_id' => env('STRIPE_PRICE_UP_TO_25_MONTHLY'),
            'annual_price_id' => env('STRIPE_PRICE_UP_TO_25_ANNUAL'),
        ],
        'up_to_30' => [
            'label' => 'Up to 30 users',
            'seat_limit' => 30,
            'monthly_amount' => 45900,
            'annual_amount' => 459000,
            'monthly_price_id' => env('STRIPE_PRICE_UP_TO_30_MONTHLY'),
            'annual_price_id' => env('STRIPE_PRICE_UP_TO_30_ANNUAL'),
        ],
        'up_to_40' => [
            'label' => 'Up to 40 users',
            'seat_limit' => 40,
            'monthly_amount' => 59900,
            'annual_amount' => 599000,
            'monthly_price_id' => env('STRIPE_PRICE_UP_TO_40_MONTHLY'),
            'annual_price_id' => env('STRIPE_PRICE_UP_TO_40_ANNUAL'),
        ],
        'up_to_50' => [
            'label' => 'Up to 50 users',
            'seat_limit' => 50,
            'monthly_amount' => 73900,
            'annual_amount' => 739000,
            'monthly_price_id' => env('STRIPE_PRICE_UP_TO_50_MONTHLY'),
            'annual_price_id' => env('STRIPE_PRICE_UP_TO_50_ANNUAL'),
        ],
        'up_to_75' => [
            'label' => 'Up to 75 users',
            'seat_limit' => 75,
            'monthly_amount' => 104900,
            'annual_amount' => 1049000,
            'monthly_price_id' => env('STRIPE_PRICE_UP_TO_75_MONTHLY'),
            'annual_price_id' => env('STRIPE_PRICE_UP_TO_75_ANNUAL'),
        ],
        'up_to_100' => [
            'label' => 'Up to 100 users',
            'seat_limit' => 100,
            'monthly_amount' => 134900,
            'annual_amount' => 1349000,
            'monthly_price_id' => env('STRIPE_PRICE_UP_TO_100_MONTHLY'),
            'annual_price_id' => env('STRIPE_PRICE_UP_TO_100_ANNUAL'),
        ],
    ],

];
