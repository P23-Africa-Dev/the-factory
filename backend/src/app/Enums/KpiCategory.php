<?php

declare(strict_types=1);

namespace App\Enums;

enum KpiCategory: string
{
    case SALES = 'sales';
    case CUSTOMER_VISITS = 'customer_visits';
    case LEAD_GENERATION = 'lead_generation';
    case COLLECTION = 'collection';
    case SURVEY = 'survey';
    case MERCHANDISING = 'merchandising';

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
