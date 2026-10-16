<?php

declare(strict_types=1);

namespace App\Enums;

enum LeadFieldType: string
{
    case TEXT = 'text';
    case TEXTAREA = 'textarea';
    case NUMBER = 'number';
    case DATE = 'date';
    case SELECT = 'select';
    case MULTI_SELECT = 'multi_select';
    case CHECKBOX = 'checkbox';
    case URL = 'url';
    case PHONE = 'phone';

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }

    public function usesOptions(): bool
    {
        return $this === self::SELECT || $this === self::MULTI_SELECT;
    }
}
