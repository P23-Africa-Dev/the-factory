<?php

namespace App\Enums;

enum SalesEngineAccessRequestStatus: string
{
    case PENDING = 'pending';
    case APPROVED = 'approved';
    case DECLINED = 'declined';

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
