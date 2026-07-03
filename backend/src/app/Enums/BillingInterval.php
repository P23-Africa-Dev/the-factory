<?php

declare(strict_types=1);

namespace App\Enums;

enum BillingInterval: string
{
    case MONTHLY = 'monthly';
    case ANNUAL = 'annual';

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
