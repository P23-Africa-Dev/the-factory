<?php

declare(strict_types=1);

namespace App\Enums;

enum PayrollSalaryType: string
{
    case MONTHLY = 'monthly';
    case WEEKLY = 'weekly';

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
