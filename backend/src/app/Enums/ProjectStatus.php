<?php

declare(strict_types=1);

namespace App\Enums;

enum ProjectStatus: string
{
    case ACTIVE = 'active';
    case PLANNING = 'planning';
    case COMPLETED = 'completed';

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
