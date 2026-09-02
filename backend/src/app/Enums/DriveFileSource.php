<?php

declare(strict_types=1);

namespace App\Enums;

enum DriveFileSource: string
{
    case MANUAL = 'manual';
    case ELY_REPORT = 'ely_report';
}
