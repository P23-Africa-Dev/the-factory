<?php

declare(strict_types=1);

namespace App\Enums;

enum FieldMovementState: string
{
    case MOVING = 'moving';
    case SLOW = 'slow';
    case STOPPED = 'stopped';
}
