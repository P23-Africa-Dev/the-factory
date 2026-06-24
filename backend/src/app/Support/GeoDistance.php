<?php

declare(strict_types=1);

namespace App\Support;

final class GeoDistance
{
    private const EARTH_RADIUS_KM = 6371.0;

    public static function haversineKm(float $lat1, float $lon1, float $lat2, float $lon2): float
    {
        $latFrom = deg2rad($lat1);
        $latTo = deg2rad($lat2);
        $latDelta = deg2rad($lat2 - $lat1);
        $lonDelta = deg2rad($lon2 - $lon1);

        $a = sin($latDelta / 2) ** 2
            + cos($latFrom) * cos($latTo) * sin($lonDelta / 2) ** 2;
        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));

        return round(self::EARTH_RADIUS_KM * $c, 2);
    }

    public static function isValidCoordinate(?float $latitude, ?float $longitude): bool
    {
        if ($latitude === null || $longitude === null) {
            return false;
        }

        return $latitude >= -90 && $latitude <= 90
            && $longitude >= -180 && $longitude <= 180
            && ! ($latitude === 0.0 && $longitude === 0.0);
    }
}
