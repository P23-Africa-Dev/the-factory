<?php

declare(strict_types=1);

namespace App\Enums;

enum NotificationCategory: string
{
    case AUTH = 'auth';
    case ONBOARDING = 'onboarding';
    case TASK = 'task';
    case PROJECT = 'project';
    case TRACKING = 'tracking';
    case ATTENDANCE = 'attendance';
    case PAYROLL = 'payroll';
    case CRM = 'crm';
    case WORKFORCE = 'workforce';
    case PROFILE = 'profile';
    case SYSTEM = 'system';

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
