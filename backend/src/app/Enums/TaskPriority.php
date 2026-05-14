<?php

declare(strict_types=1);

namespace App\Enums;

enum TaskPriority: string
{
    case HIGH = 'high';
    case MEDIUM = 'medium';
    case LOW = 'low';

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
