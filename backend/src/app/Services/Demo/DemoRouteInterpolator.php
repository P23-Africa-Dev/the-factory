<?php

declare(strict_types=1);

namespace App\Services\Demo;

use Illuminate\Support\Carbon;

class DemoRouteInterpolator
{
    /**
     * @return array{latitude: float, longitude: float}
     */
    public function offsetStartFromDestination(float $destLat, float $destLng, ?float $offsetKm = null): array
    {
        $km = $offsetKm ?? (float) config('demo.tracking_start_offset_km', 2.0);
        $latOffset = $km / 111.0;
        $lngOffset = $km / (111.0 * max(0.1, cos(deg2rad($destLat))));

        return [
            'latitude' => $destLat + $latOffset,
            'longitude' => $destLng - $lngOffset,
        ];
    }

    /**
     * @return array<int, array{latitude: float, longitude: float, accuracy_meters: float, speed_mps: float, heading_degrees: float, recorded_at: string}>
     */
    public function interpolateRoute(
        float $startLat,
        float $startLng,
        float $destLat,
        float $destLng,
        ?int $steps = null,
        ?Carbon $startedAt = null,
    ): array {
        $stepCount = max(2, $steps ?? (int) config('demo.tracking_simulation_steps', 16));
        $startedAt ??= now();
        $points = [];

        for ($s = 0; $s <= $stepCount; $s++) {
            $progress = $s / $stepCount;
            $jitter = (($s % 3) - 1) * 0.0004;
            $points[] = [
                'latitude' => $startLat + ($destLat - $startLat) * $progress + $jitter,
                'longitude' => $startLng + ($destLng - $startLng) * $progress + $jitter,
                'accuracy_meters' => 8 + ($s % 4) * 3,
                'speed_mps' => $s === $stepCount ? 0.0 : 1.2 + ($s % 3) * 0.4,
                'heading_degrees' => 40 + $s * 3,
                'recorded_at' => $startedAt->copy()->addSeconds($s * (int) config('demo.tracking_simulation_interval_seconds', 8))->toIso8601String(),
            ];
        }

        return $points;
    }
}
