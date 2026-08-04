<?php

declare(strict_types=1);

namespace App\Enums;

enum FieldActivitySessionStatus: string
{
    case ACTIVE = 'active';
    case COMPLETED = 'completed';
    case AUTO_CLOSED = 'auto_closed';
}
