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
        'redirect_uri' => env(
            'GOOGLE_CALENDAR_REDIRECT_URI',
            rtrim((string) env('APP_URL', 'http://localhost'), '/').'/api/v1/calendar/integration/callback',
        ),
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
        // Env default only — runtime stack is overridden by platform_settings.ai.stack when set.
        'stack' => env('AI_STACK', 'openai_claude'),
        'provider' => env('AI_PROVIDER', 'openai'),
        'fallback_provider' => env('AI_FALLBACK_PROVIDER', 'claude'),
        'default_model' => env('AI_DEFAULT_MODEL', 'auto'),
        'exec_model' => env('AI_EXEC_MODEL', 'auto'),
        'analyst_model' => env('AI_ANALYST_MODEL', 'auto'),
        'request_timeout_ms' => (int) env('AI_REQUEST_TIMEOUT_MS', 30000),
        'max_tokens' => (int) env('AI_MAX_TOKENS', 4000),
        'router_model' => env('AI_ROUTER_MODEL', 'auto'),
        'provider_skip_ttl_seconds' => (int) env('AI_PROVIDER_SKIP_TTL', 300),
        'enable_hybrid_router' => filter_var(env('AI_ENABLE_HYBRID_ROUTER', true), FILTER_VALIDATE_BOOL),
        'enable_read_synthesis' => filter_var(env('AI_ENABLE_READ_SYNTHESIS', true), FILTER_VALIDATE_BOOL),
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
            'vision_model' => env('OPENAI_VISION_MODEL', 'gpt-4o-mini'),
        ],
        'claude' => [
            'api_key' => env('ANTHROPIC_API_KEY'),
            'base_url' => env('ANTHROPIC_BASE_URL', 'https://api.anthropic.com/v1'),
            'model' => env('CLAUDE_MODEL', 'auto'),
            'version' => env('ANTHROPIC_VERSION', '2023-06-01'),
        ],
        'nvidia' => [
            'api_key' => env('NVIDIA_API_KEY'),
            'base_url' => env('NVIDIA_BASE_URL', 'https://integrate.api.nvidia.com/v1'),
            // Hosted NIM often exceeds the global 30s AI timeout under queue load.
            'request_timeout_ms' => (int) env('NVIDIA_REQUEST_TIMEOUT_MS', 120000),
            // Cap day-to-day chat completions; larger budgets slow large models further.
            'operational_max_tokens' => (int) env('NVIDIA_OPERATIONAL_MAX_TOKENS', 1000),
            'routing_model' => env('NVIDIA_ROUTING_MODEL', 'nvidia/llama-3.1-nemotron-nano-8b-v1'),
            // Nano-class default for snappy Ask ELY; override with Super-49B via env if needed.
            'exec_model' => env('NVIDIA_EXEC_MODEL', 'nvidia/llama-3.1-nemotron-nano-8b-v1'),
            'analyst_model' => env('NVIDIA_ANALYST_MODEL', 'nvidia/llama-3.1-nemotron-ultra-253b-v1'),
        ],
        'admin' => [
            'spending_alert_usd' => (float) env('AI_ADMIN_SPENDING_ALERT_USD', 500),
        ],
    ],

    'vapid' => [
        'public_key' => env('VAPID_PUBLIC_KEY'),
        'private_key' => env('VAPID_PRIVATE_KEY'),
        'subject' => env('VAPID_SUBJECT', 'mailto:info@thefactory23.com'),
    ],

];
