<?php

declare(strict_types=1);

namespace App\Enums;

enum LeadFieldStatus: string
{
    case ACTIVE = 'active';
    case PENDING = 'pending';
    case DECLINED = 'declined';
    case ARCHIVED = 'archived';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }

    public function isVisibleOnLeads(): bool
    {
        return $this === self::ACTIVE || $this === self::PENDING;
    }
}
