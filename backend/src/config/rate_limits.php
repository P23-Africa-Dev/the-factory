<?php

declare(strict_types=1);

return [

    /*
    |--------------------------------------------------------------------------
    | Login rate limits (failed attempts only — see LoginRateLimiter)
    |--------------------------------------------------------------------------
    */
    'login_email_ip_per_minute' => (int) env('RATE_LIMIT_LOGIN_EMAIL_IP', 60),
    'login_ip_per_minute' => (int) env('RATE_LIMIT_LOGIN_IP', 500),

    /*
    |--------------------------------------------------------------------------
    | General API rate limits (per authenticated user id, else per IP)
    |--------------------------------------------------------------------------
    */
    'api_per_minute' => (int) env('RATE_LIMIT_API_PER_MINUTE', 300),
    'api_heavy_per_minute' => (int) env('RATE_LIMIT_API_HEAVY_PER_MINUTE', 600),

    /*
    |--------------------------------------------------------------------------
    | Abuse-sensitive public/auth endpoints (always per IP)
    |--------------------------------------------------------------------------
    */
    'auth_sensitive_per_minute' => (int) env('RATE_LIMIT_AUTH_SENSITIVE', 30),
    'auth_register_per_minute' => (int) env('RATE_LIMIT_AUTH_REGISTER', 15),
    'auth_resend_otp_per_10_minutes' => (int) env('RATE_LIMIT_AUTH_RESEND_OTP', 5),
    'auth_forgot_password_per_minute' => (int) env('RATE_LIMIT_AUTH_FORGOT_PASSWORD', 15),

];
