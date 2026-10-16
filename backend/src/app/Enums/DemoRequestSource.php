<?php

declare(strict_types=1);

namespace App\Enums;

enum DemoRequestSource: string
{
    case WEBSITE = 'website';
    case ADMIN_DIRECT = 'admin_direct';

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
