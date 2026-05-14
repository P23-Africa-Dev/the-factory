<?php

declare(strict_types=1);

namespace App\Enums;

enum ProjectType: string
{
    case SALES = 'sales';
    case INSPECTION = 'inspection';
    case DEPLOYMENT = 'deployment';

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
