<?php

declare(strict_types=1);

namespace App\Enums;

enum FieldStopClassification: string
{
    case CUSTOMER_VISIT = 'customer_visit';
    case LEAD_VISIT = 'lead_visit';
    case ORG_VISIT = 'org_visit';
    case PERSONAL = 'personal';
    case IGNORE = 'ignore';
    case PENDING = 'pending';
}
