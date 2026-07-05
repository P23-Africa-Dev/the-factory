<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'fcm' => [
        'server_key' => env('FCM_SERVER_KEY'),
        'legacy_send_endpoint' => env('FCM_LEGACY_SEND_ENDPOINT', 'https://fcm.googleapis.com/fcm/send'),
    ],

    'google_calendar' => [
        'client_id' => env('GOOGLE_CALENDAR_CLIENT_ID'),
        'client_secret' => env('GOOGLE_CALENDAR_CLIENT_SECRET'),
        'redirect_uri' => env('GOOGLE_CALENDAR_REDIRECT_URI'),
        'scopes' => array_values(array_filter(array_map('trim', explode(',', (string) env(
            'GOOGLE_CALENDAR_SCOPES',
            'openid,email,profile,https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/calendar.events,https://www.googleapis.com/auth/gmail.readonly,https://www.googleapis.com/auth/gmail.send,https://www.googleapis.com/auth/gmail.modify',
        ))))),
    ],

    'mapbox' => [
        // Use a server-side token when available, fallback keeps local/dev parity.
        'access_token' => env('MAPBOX_ACCESS_TOKEN', env('NEXT_PUBLIC_MAPBOX_TOKEN')),
    ],

    'ai' => [
        'provider' => env('AI_PROVIDER', 'openai'),
        'fallback_provider' => env('AI_FALLBACK_PROVIDER', 'claude'),
        'default_model' => env('AI_DEFAULT_MODEL', 'auto'),
        'exec_model' => env('AI_EXEC_MODEL', 'auto'),
        'analyst_model' => env('AI_ANALYST_MODEL', 'auto'),
        'request_timeout_ms' => (int) env('AI_REQUEST_TIMEOUT_MS', 30000),
        'max_tokens' => (int) env('AI_MAX_TOKENS', 4000),
        'enable_streaming' => filter_var(env('AI_ENABLE_STREAMING', true), FILTER_VALIDATE_BOOL),
        'enable_actions' => filter_var(env('AI_ENABLE_ACTIONS', true), FILTER_VALIDATE_BOOL),
        'strict_confirmation_blocking' => filter_var(env('AI_STRICT_CONFIRMATION_BLOCKING', false), FILTER_VALIDATE_BOOL),
        'strict_confirmation_blocking_codes' => array_values(array_filter(array_map('trim', explode(',', (string) env(
            'AI_STRICT_CONFIRMATION_BLOCKING_CODES',
            'used_default_title,used_default_due_date',
        ))))),
        'monthly_org_credit_limit' => (int) env('AI_MONTHLY_ORG_CREDIT_LIMIT', 0),
        'pii_redaction_enabled' => filter_var(env('AI_PII_REDACTION_ENABLED', true), FILTER_VALIDATE_BOOL),
        'openai' => [
            'api_key' => env('OPENAI_API_KEY'),
            'base_url' => env('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
            'model' => env('OPENAI_MODEL', env('AI_DEFAULT_MODEL', 'auto')),
            'audio_model' => env('OPENAI_AUDIO_MODEL', 'gpt-4o-mini-transcribe'),
        ],
        'claude' => [
            'api_key' => env('ANTHROPIC_API_KEY'),
            'base_url' => env('ANTHROPIC_BASE_URL', 'https://api.anthropic.com/v1'),
            'model' => env('CLAUDE_MODEL', 'auto'),
            'version' => env('ANTHROPIC_VERSION', '2023-06-01'),
        ],
        'admin' => [
            'spending_alert_usd' => (float) env('AI_ADMIN_SPENDING_ALERT_USD', 500),
        ],
    ],

];
