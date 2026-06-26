<?php

declare(strict_types=1);

namespace App\Enums;

enum CrmEmailStatus: string
{
    case Sending = 'sending';
    case Sent = 'sent';
    case Delivered = 'delivered';
    case Failed = 'failed';
}
