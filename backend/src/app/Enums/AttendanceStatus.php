<?php

declare(strict_types=1);

namespace App\Enums;

enum AttendanceStatus: string
{
    case PRESENT = 'present';
    case LATE = 'late';
    case AUTO_CLOCKED_OUT = 'auto_clocked_out';

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
