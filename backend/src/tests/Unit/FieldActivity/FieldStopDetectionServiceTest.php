<?php

declare(strict_types=1);

namespace Tests\Unit\FieldActivity;

use App\Enums\FieldActivitySessionStatus;
use App\Enums\FieldMovementState;
use App\Models\AttendanceRecord;
use App\Models\Company;
use App\Models\FieldActivitySession;
use App\Models\FieldLocationPoint;
use App\Models\FieldStop;
use App\Models\User;
use App\Services\FieldActivity\FieldActivityRealtimeService;
use App\Services\FieldActivity\FieldLocationIntelligenceService;
use App\Services\FieldActivity\FieldStopDetectionService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Mockery;
use Tests\TestCase;

class FieldStopDetectionServiceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Config::set('field_activity.stop_dwell_seconds', 300);
        Config::set('field_activity.stop_radius_meters', 50);
        Config::set('field_activity.stop_max_gap_seconds', 900);
    }

    public function test_one_point_batches_still_accumulate_five_minute_dwell(): void
    {
        [$session, $detector] = $this->makeSession();
        $start = Carbon::parse('2026-08-11 17:28:00', 'Africa/Lagos');

        for ($i = 0; $i <= 6; $i++) {
            $this->addPoint($session, $start->copy()->addMinutes($i), 6.51466, 3.34503, FieldMovementState::STOPPED, 0.0);
            $detector->processSession($session, collect([$session->points()->latest('id')->first()]));
        }

        $this->assertSame(1, FieldStop::query()->where('field_activity_session_id', $session->id)->count());
    }

    public function test_slow_jitter_inside_radius_does_not_reset_cluster(): void
    {
        [$session, $detector] = $this->makeSession();
        $start = Carbon::parse('2026-08-11 16:38:00', 'Africa/Lagos');

        $samples = [
            [0, 6.51620, 3.34575, FieldMovementState::SLOW, 1.0],
            [1, 6.51625, 3.34580, FieldMovementState::SLOW, 1.3],
            [2, 6.51613, 3.34590, FieldMovementState::MOVING, 2.5],
            [3, 6.51606, 3.34592, FieldMovementState::SLOW, 2.0],
            [4, 6.51592, 3.34565, FieldMovementState::SLOW, 2.0],
            [5, 6.51614, 3.34595, FieldMovementState::SLOW, 0.32],
            [6, 6.51633, 3.34559, FieldMovementState::SLOW, 0.34],
        ];

        foreach ($samples as [$minute, $lat, $lng, $state, $speed]) {
            $this->addPoint($session, $start->copy()->addMinutes($minute), $lat, $lng, $state, $speed);
            $detector->processSession($session);
        }

        $this->assertTrue(
            FieldStop::query()->where('field_activity_session_id', $session->id)->exists(),
        );
    }

    /**
     * @return array{0: FieldActivitySession, 1: FieldStopDetectionService}
     */
    private function makeSession(): array
    {
        $company = Company::create([
            'company_id' => 'FAC-STOP-' . strtoupper((string) fake()->lexify('????')),
            'name' => 'Stop Detect Co',
            'country' => 'NG',
            'currency_code' => 'NGN',
            'team_size' => '11-50',
            'use_case' => 'Stop detection',
            'status' => 'active',
            'activated_at' => now(),
            'field_activity_enabled' => true,
        ]);
        $agent = User::factory()->create(['internal_role' => 'agent', 'is_active' => true]);
        $record = AttendanceRecord::query()->create([
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'attendance_date' => '2026-08-11',
            'clock_in_at' => Carbon::parse('2026-08-11 09:00:00'),
            'status' => 'present',
        ]);
        $session = FieldActivitySession::query()->create([
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'attendance_record_id' => $record->id,
            'status' => FieldActivitySessionStatus::ACTIVE,
            'started_at' => Carbon::parse('2026-08-11 09:00:00'),
        ]);

        $intelligence = Mockery::mock(FieldLocationIntelligenceService::class);
        $intelligence->shouldReceive('enrichStop')->andReturnUsing(static fn ($stop) => $stop);
        $realtime = Mockery::mock(FieldActivityRealtimeService::class);
        $realtime->shouldReceive('publishStopCreated')->andReturnNull();

        return [$session, new FieldStopDetectionService($intelligence, $realtime)];
    }

    private function addPoint(
        FieldActivitySession $session,
        Carbon $at,
        float $lat,
        float $lng,
        FieldMovementState $state,
        float $speedMps,
    ): void {
        FieldLocationPoint::query()->create([
            'field_activity_session_id' => $session->id,
            'company_id' => $session->company_id,
            'user_id' => $session->user_id,
            'latitude' => $lat,
            'longitude' => $lng,
            'speed_mps' => $speedMps,
            'movement_state' => $state,
            'recorded_at' => $at,
        ]);
    }
}
