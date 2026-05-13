<?php

namespace App\Enums;

enum WorkspacePurposeEnum: string
{
    case PERSONAL = 'personal';
    case STARTUP = 'startup';
    case ENTERPRISE = 'enterprise';
    case FREELANCING = 'freelancing';
    case EDUCATION = 'education';
    case NON_PROFIT = 'non_profit';
    case OTHER = 'other';

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }

    public function label(): string
    {
        return match ($this) {
            self::PERSONAL => 'Personal use',
            self::STARTUP => 'Startup',
            self::ENTERPRISE => 'Enterprise / Business',
            self::FREELANCING => 'Freelancing',
            self::EDUCATION => 'Education',
            self::NON_PROFIT => 'Non-profit',
            self::OTHER => 'Other',
        };
    }
}
