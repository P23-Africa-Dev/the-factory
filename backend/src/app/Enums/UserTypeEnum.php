<?php

namespace App\Enums;

enum UserTypeEnum: string
{
    case DEVELOPER = 'developer';
    case DESIGNER = 'designer';
    case PRODUCT_MANAGER = 'product_manager';
    case MARKETING = 'marketing';
    case SALES = 'sales';
    case OPERATIONS = 'operations';
    case FOUNDER = 'founder';
    case STUDENT = 'student';
    case OTHER = 'other';

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }

    public function label(): string
    {
        return match ($this) {
            self::DEVELOPER => 'Developer / Engineer',
            self::DESIGNER => 'Designer',
            self::PRODUCT_MANAGER => 'Product Manager',
            self::MARKETING => 'Marketing',
            self::SALES => 'Sales',
            self::OPERATIONS => 'Operations',
            self::FOUNDER => 'Founder / CEO',
            self::STUDENT => 'Student',
            self::OTHER => 'Other',
        };
    }
}
