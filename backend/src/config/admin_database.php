<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Master Reset Token
    |--------------------------------------------------------------------------
    | Prime passcode reset token. Stored OUTSIDE the database (env / K8s
    | secret) so that only holders of the token can rotate the DB manager
    | passcode. Rotate by updating the Kubernetes secret and redeploying.
    */
    'master_reset_token' => env('DB_MANAGER_MASTER_RESET_TOKEN', ''),

    /*
    |--------------------------------------------------------------------------
    | Unlock Window (minutes)
    |--------------------------------------------------------------------------
    | How long an admin remains "unlocked" after entering the passcode before
    | they must re-enter it. Keep this short — this is a step-up gate.
    */
    'unlock_ttl_minutes' => (int) env('DB_MANAGER_UNLOCK_TTL_MINUTES', 15),

    /*
    |--------------------------------------------------------------------------
    | Sensitive Tables
    |--------------------------------------------------------------------------
    | Tables that must show a red banner and require an extra confirmation
    | dialog before any row or schema edit. Missing tables are treated as
    | non-sensitive, but a global confirmation is still required.
    */
    'sensitive_tables' => [
        'users',
        'admin_users',
        'admin_action_logs',
        'platform_settings',
        'password_reset_tokens',
        'personal_access_tokens',
        'sessions',
        'billing_plans',
        'companies',
        'company_users',
        'subscriptions',
        'subscription_items',
        'stripe_customers',
        'user_verifications',
        'internal_user_invitations',
    ],

    /*
    |--------------------------------------------------------------------------
    | Tables Blocked From Deletion
    |--------------------------------------------------------------------------
    | Tables that may be edited but NEVER dropped from this UI. Additional
    | belt-and-braces protection over the sensitive list.
    */
    'undroppable_tables' => [
        'users',
        'admin_users',
        'admin_action_logs',
        'platform_settings',
        'migrations',
    ],

    /*
    |--------------------------------------------------------------------------
    | Session Keys
    |--------------------------------------------------------------------------
    */
    'session_unlock_key' => 'db_manager.unlocked_at',
    'session_unlock_admin_key' => 'db_manager.unlocked_admin_id',
];
