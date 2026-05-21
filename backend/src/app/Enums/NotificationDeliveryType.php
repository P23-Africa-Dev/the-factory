<?php

declare(strict_types=1);

namespace App\Enums;

enum NotificationDeliveryType: string
{
    case IN_APP = 'in_app';
    case PUSH = 'push';
    case EMAIL = 'email';
    case SMS = 'sms';
    case WHATSAPP = 'whatsapp';

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
