<?php

declare(strict_types=1);

namespace App\Enums;

enum KpiPriority: string
{
    case LOW = 'low';
    case MEDIUM = 'medium';
    case HIGH = 'high';
    case CRITICAL = 'critical';

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
