<?php

declare(strict_types=1);

namespace App\Enums;

enum DriveGranteeType: string
{
    case USER = 'user';
    case ALL = 'all';
}
