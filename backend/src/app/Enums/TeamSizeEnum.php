<?php

namespace App\Enums;

enum TeamSizeEnum: string
{
    case SOLO = 'solo';
    case SMALL = '2-10';
    case MEDIUM = '11-50';
    case LARGE = '51-200';
    case ENTERPRISE = '201-500';
    case EXTRA_LARGE = '500+';

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }

    public function label(): string
    {
        return match ($this) {
            self::SOLO => 'Just me',
            self::SMALL => '2–10 people',
            self::MEDIUM => '11–50 people',
            self::LARGE => '51–200 people',
            self::ENTERPRISE => '201–500 people',
            self::EXTRA_LARGE => '500+ people',
        };
    }
}
