<?php

declare(strict_types=1);

namespace App\Services\FieldActivity;

use App\Enums\FieldMovementState;
use App\Support\GeoDistance;

class FieldMovementEngine
{
    /**
     * @param  array{latitude: float, longitude: float, speed_mps?: float|null, recorded_at?: mixed}|null  $previous
     * @param  array{latitude: float, longitude: float, speed_mps?: float|null, recorded_at?: mixed}  $current
     * @return array{distance_meters: float, speed_kmh: float|null, heading_degrees: float|null, movement_state: FieldMovementState}
     */
    public function interpret(?array $previous, array $current): array
    {
        $distanceMeters = 0.0;
        $heading = null;

        if ($previous !== null) {
            $distanceMeters = GeoDistance::haversineMeters(
                (float) $previous['latitude'],
                (float) $previous['longitude'],
                (float) $current['latitude'],
                (float) $current['longitude'],
            );
            $heading = $this->bearingDegrees(
                (float) $previous['latitude'],
                (float) $previous['longitude'],
                (float) $current['latitude'],
                (float) $current['longitude'],
            );
        }

        $speedKmh = null;
        if (array_key_exists('speed_mps', $current) && $current['speed_mps'] !== null) {
            $speedKmh = (float) $current['speed_mps'] * 3.6;
        } elseif ($previous !== null && isset($previous['recorded_at'], $current['recorded_at'])) {
            $prevAt = strtotime((string) $previous['recorded_at']);
            $currAt = strtotime((string) $current['recorded_at']);
            if ($prevAt !== false && $currAt !== false && $currAt > $prevAt) {
                $seconds = max(1, $currAt - $prevAt);
                $speedKmh = ($distanceMeters / $seconds) * 3.6;
            }
        }

        return [
            'distance_meters' => $distanceMeters,
            'speed_kmh' => $speedKmh,
            'heading_degrees' => $heading,
            'movement_state' => $this->classifyMovement($speedKmh, $distanceMeters),
        ];
    }

    public function classifyMovement(?float $speedKmh, float $distanceMeters = 0.0): FieldMovementState
    {
        $stopMax = (float) config('field_activity.stop_max_speed_kmh', 1.0);
        $slowMax = (float) config('field_activity.slow_max_speed_kmh', 8.0);
        $stopRadius = (float) config('field_activity.stop_radius_meters', 50);

        if ($speedKmh === null) {
            // No speed: treat tiny displacement as stopped, otherwise moving.
            return $distanceMeters <= $stopRadius
                ? FieldMovementState::STOPPED
                : FieldMovementState::MOVING;
        }

        if ($speedKmh < $stopMax) {
            return FieldMovementState::STOPPED;
        }

        if ($speedKmh < $slowMax) {
            return FieldMovementState::SLOW;
        }

        return FieldMovementState::MOVING;
    }

    private function bearingDegrees(float $fromLat, float $fromLng, float $toLat, float $toLng): float
    {
        $lat1 = deg2rad($fromLat);
        $lat2 = deg2rad($toLat);
        $deltaLng = deg2rad($toLng - $fromLng);

        $y = sin($deltaLng) * cos($lat2);
        $x = cos($lat1) * sin($lat2) - sin($lat1) * cos($lat2) * cos($deltaLng);
        $bearing = rad2deg(atan2($y, $x));

        return fmod($bearing + 360.0, 360.0);
    }
}
