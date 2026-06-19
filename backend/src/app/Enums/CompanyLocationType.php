<?php

declare(strict_types=1);

namespace App\Enums;

enum CompanyLocationType: string
{
    case OFFICE = 'office';
    case WAREHOUSE = 'warehouse';
    case AIRPORT = 'airport';
    case RAILWAY_STATION = 'railway_station';
    case BUS_TERMINAL = 'bus_terminal';
    case SEAPORT = 'seaport';
    case FILLING_STATION = 'filling_station';
    case CLIENT_SITE = 'client_site';
    case SERVICE_CENTER = 'service_center';
    case DISTRIBUTION_CENTER = 'distribution_center';
    case HOSPITAL = 'hospital';
    case SCHOOL = 'school';
    case HOTEL = 'hotel';
    case RESTAURANT = 'restaurant';
    case GOVERNMENT_OFFICE = 'government_office';
    case RETAIL_STORE = 'retail_store';
    case OTHER = 'other';

    /**
     * @return array<int, string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
