<?php

declare(strict_types=1);

namespace App\Enums;

enum CrmEmailDirection: string
{
    case Sent = 'sent';
    case Received = 'received';
}
