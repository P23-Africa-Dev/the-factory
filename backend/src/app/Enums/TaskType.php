<?php

declare(strict_types=1);

namespace App\Enums;

enum TaskType: string
{
    case SALES_VISIT = 'sales_visit';
    case INSPECTION = 'inspection';
    case DELIVERY = 'delivery';
    case COLLECTION = 'collection';
    case AWARENESS = 'awareness';

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
