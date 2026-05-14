<?php

namespace App\Enums;

enum VerificationType: string
{
    case REGISTRATION = 'registration';
    case LOGIN = 'login';
    case PASSWORD_RESET = 'password_reset';

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
