<?php

namespace App\Enums;

enum CompanyUserRole: string
{
    case OWNER = 'owner';
    case ADMIN = 'admin';
    case SUPERVISOR = 'supervisor';
    case AGENT = 'agent';
    case MEMBER = 'member';

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
