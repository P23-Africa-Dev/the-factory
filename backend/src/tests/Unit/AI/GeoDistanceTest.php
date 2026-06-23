<?php

declare(strict_types=1);

namespace Tests\Unit\AI;

use App\Support\GeoDistance;
use Tests\TestCase;

final class GeoDistanceTest extends TestCase
{
    public function test_haversine_returns_expected_distance(): void
    {
        $distance = GeoDistance::haversineKm(6.5244, 3.3792, 6.4400, 3.4500);

        $this->assertGreaterThan(10.0, $distance);
        $this->assertLessThan(15.0, $distance);
    }

    public function test_is_valid_coordinate_rejects_null_and_zero_island(): void
    {
        $this->assertFalse(GeoDistance::isValidCoordinate(null, 3.0));
        $this->assertFalse(GeoDistance::isValidCoordinate(6.0, null));
        $this->assertFalse(GeoDistance::isValidCoordinate(0.0, 0.0));
        $this->assertTrue(GeoDistance::isValidCoordinate(6.5244, 3.3792));
    }
}
