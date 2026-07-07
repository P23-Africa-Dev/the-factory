<?php

declare(strict_types=1);

return [

    'disk' => env('DRIVE_FILESYSTEM_DISK', 'drive'),

    'root' => env('DRIVE_STORAGE_ROOT', 'drive'),

    'max_upload_bytes' => (int) env('DRIVE_MAX_UPLOAD_MB', 50) * 1024 * 1024,

    'default_quota_gb' => (float) env('DRIVE_DEFAULT_QUOTA_GB', 2),

    'plan_quotas_gb' => [
        'up_to_5' => 5,
        'up_to_10' => 10,
        'up_to_15' => 15,
        'up_to_20' => 20,
        'up_to_30' => 30,
        'up_to_50' => 50,
    ],

    'allowed_mimes' => [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'text/plain',
        'text/csv',
        'application/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/zip',
        'application/x-zip-compressed',
    ],

    'ely_reports_folder_name' => 'ELY Reports',

    'ely_reports_system_key' => 'ely_reports',

];
