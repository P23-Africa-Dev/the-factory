<?php

declare(strict_types=1);

namespace App\Enums;

enum FieldStopClassifiedBy: string
{
    case AUTO = 'auto';
    case AGENT = 'agent';
    case REMINDER = 'reminder';
    case SYSTEM = 'system';
}
