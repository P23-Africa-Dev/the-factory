<?php

declare(strict_types=1);

namespace App\Enums;

enum FieldStopMatchType: string
{
    case CRM_CUSTOMER = 'crm_customer';
    case CRM_LEAD = 'crm_lead';
    case ORG_LOCATION = 'org_location';
    case TERRITORY = 'territory';
    case POI = 'poi';
    case RESIDENTIAL = 'residential';
    case MEETING = 'meeting';
    case TASK = 'task';
    case UNKNOWN = 'unknown';
}
