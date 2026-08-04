<?php

declare(strict_types=1);

namespace Tests\Unit\FieldActivity;

use App\Enums\FieldMovementState;
use App\Services\FieldActivity\FieldMovementEngine;
use Tests\TestCase;

class FieldMovementEngineTest extends TestCase
{
    public function test_classifies_stopped_when_speed_below_one_kmh(): void
    {
        $engine = new FieldMovementEngine();
        $this->assertSame(FieldMovementState::STOPPED, $engine->classifyMovement(0.5));
    }

    public function test_classifies_slow_and_moving(): void
    {
        $engine = new FieldMovementEngine();
        $this->assertSame(FieldMovementState::SLOW, $engine->classifyMovement(5.0));
        $this->assertSame(FieldMovementState::MOVING, $engine->classifyMovement(20.0));
    }

    public function test_interpret_computes_distance_between_points(): void
    {
        $engine = new FieldMovementEngine();
        $result = $engine->interpret(
            [
                'latitude' => 6.5244,
                'longitude' => 3.3792,
                'recorded_at' => '2026-07-29T10:00:00+00:00',
            ],
            [
                'latitude' => 6.5254,
                'longitude' => 3.3792,
                'speed_mps' => 0.1,
                'recorded_at' => '2026-07-29T10:01:00+00:00',
            ],
        );

        $this->assertGreaterThan(50, $result['distance_meters']);
        $this->assertSame(FieldMovementState::STOPPED, $result['movement_state']);
    }
}
