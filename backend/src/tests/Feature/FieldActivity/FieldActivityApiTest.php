<?php

declare(strict_types=1);

namespace Tests\Feature\FieldActivity;

use App\Models\AttendanceRecord;
use App\Models\AttendanceSetting;
use App\Models\Company;
use App\Models\CompanyLocation;
use App\Models\FieldActivitySession;
use App\Models\FieldLocationPoint;
use App\Models\FieldStop;
use App\Models\Lead;
use App\Models\User;
use App\Services\Location\MapboxGeocodingService;
use App\Services\AI\Providers\AiProviderRouter;
use App\Services\Attendance\AttendanceService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Mockery;
use Tests\TestCase;

class FieldActivityApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Config::set('field_activity.stop_dwell_seconds', 300);
        Config::set('field_activity.stop_radius_meters', 50);
        Config::set('field_activity.persist_min_interval_seconds', 0);
        Config::set('field_activity.persist_min_distance_meters', 0);
        Config::set('field_activity.auto_classify_min_confidence', 0.95);

        $geo = Mockery::mock(MapboxGeocodingService::class);
        $geo->shouldReceive('reverseGeocodeCoordinates')->andReturn([
            'place_name' => 'Test Address, Lagos',
        ]);
        $this->app->instance(MapboxGeocodingService::class, $geo);

        $ai = Mockery::mock(AiProviderRouter::class);
        $ai->shouldReceive('generateForPurpose')->andReturn(null);
        $this->app->instance(AiProviderRouter::class, $ai);
    }

    public function test_clock_in_creates_field_session_when_enabled(): void
    {
        [$company, $owner, $agent] = $this->seedCompany();
        $company->forceFill(['field_activity_enabled' => true])->save();
        $this->seedAttendanceSettings($company);

        Carbon::setTestNow(Carbon::parse('2026-07-29 10:00:00', 'Africa/Lagos'));

        $response = $this->actingAs($agent, 'sanctum')
            ->postJson('/api/v1/agent/attendance/clock-in', [
                'company_id' => $company->id,
                'latitude' => 6.5244,
                'longitude' => 3.3792,
                'accuracy_m' => 10,
            ]);

        $response->assertCreated();

        $this->assertDatabaseHas('field_activity_sessions', [
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'status' => 'active',
        ]);
    }

    public function test_clock_in_seeds_initial_field_location_point(): void
    {
        [$company, $owner, $agent] = $this->seedCompany();
        $company->forceFill(['field_activity_enabled' => true])->save();
        $this->seedAttendanceSettings($company);

        Carbon::setTestNow(Carbon::parse('2026-07-29 10:00:00', 'Africa/Lagos'));

        $this->actingAs($agent, 'sanctum')
            ->postJson('/api/v1/agent/attendance/clock-in', [
                'company_id' => $company->id,
                'latitude' => 6.5244,
                'longitude' => 3.3792,
                'accuracy_m' => 10,
            ])
            ->assertCreated();

        $session = FieldActivitySession::query()->where('company_id', $company->id)->where('user_id', $agent->id)->firstOrFail();
        $point = FieldLocationPoint::query()->where('field_activity_session_id', $session->id)->first();

        $this->assertNotNull($point);
        $this->assertSame(6.5244, round((float) $point->latitude, 4));
        $this->assertSame(3.3792, round((float) $point->longitude, 4));
        $this->assertSame('stopped', $point->movement_state?->value);
    }

    public function test_clock_in_with_utc_recorded_at_is_stored_in_app_timezone(): void
    {
        [$company, $owner, $agent] = $this->seedCompany();
        $company->forceFill(['field_activity_enabled' => true])->save();
        $this->seedAttendanceSettings($company);

        Carbon::setTestNow(Carbon::parse('2026-07-29 10:00:10', 'Africa/Lagos'));

        // The PWA sends recorded_at as UTC ISO. 09:00:00Z == 10:00:00 Lagos.
        $this->actingAs($agent, 'sanctum')
            ->postJson('/api/v1/agent/attendance/clock-in', [
                'company_id' => $company->id,
                'latitude' => 6.5244,
                'longitude' => 3.3792,
                'accuracy_m' => 10,
                'recorded_at' => '2026-07-29T09:00:00.000Z',
            ])
            ->assertCreated();

        $record = AttendanceRecord::query()
            ->where('company_id', $company->id)
            ->where('user_id', $agent->id)
            ->firstOrFail();

        $this->assertSame(
            '2026-07-29 10:00:00',
            $record->clock_in_at?->format('Y-m-d H:i:s'),
            'UTC recorded_at must be converted to the app timezone before storage.',
        );
    }

    public function test_utc_recorded_points_do_not_inflate_active_seconds(): void
    {
        [$company, $owner, $agent] = $this->seedCompany();
        $company->forceFill(['field_activity_enabled' => true])->save();
        $this->seedAttendanceSettings($company);

        Carbon::setTestNow(Carbon::parse('2026-07-29 10:00:00', 'Africa/Lagos'));

        $this->actingAs($agent, 'sanctum')
            ->postJson('/api/v1/agent/attendance/clock-in', [
                'company_id' => $company->id,
                'latitude' => 6.5244,
                'longitude' => 3.3792,
            ])
            ->assertCreated();

        $session = FieldActivitySession::query()->where('user_id', $agent->id)->firstOrFail();

        // Two points, one and two minutes after clock-in, sent as UTC ISO the
        // way the PWA does (09:01Z == 10:01 Lagos). Before the timezone fix,
        // each mixed-timezone interval added ~3600 phantom seconds.
        $this->actingAs($agent, 'sanctum')
            ->postJson("/api/v1/agent/field-activity/sessions/{$session->id}/points", [
                'company_id' => $company->id,
                'points' => [
                    [
                        'latitude' => 6.5250,
                        'longitude' => 3.3800,
                        'speed_mps' => 5,
                        'recorded_at' => '2026-07-29T09:01:00.000Z',
                    ],
                    [
                        'latitude' => 6.5260,
                        'longitude' => 3.3810,
                        'speed_mps' => 5,
                        'recorded_at' => '2026-07-29T09:02:00.000Z',
                    ],
                ],
            ])
            ->assertOk();

        $session->refresh();
        $activeSeconds = (int) $session->travel_seconds + (int) $session->stationary_seconds;

        $this->assertSame(
            120,
            $activeSeconds,
            "Active seconds should equal the real elapsed time (got {$activeSeconds}).",
        );
    }

    public function test_offline_gap_between_points_is_capped_for_active_seconds(): void
    {
        [$company, $owner, $agent] = $this->seedCompany();
        $company->forceFill(['field_activity_enabled' => true])->save();
        $this->seedAttendanceSettings($company);
        Config::set('field_activity.max_active_interval_seconds', 900);

        Carbon::setTestNow(Carbon::parse('2026-07-29 10:00:00', 'Africa/Lagos'));

        $this->actingAs($agent, 'sanctum')
            ->postJson('/api/v1/agent/attendance/clock-in', [
                'company_id' => $company->id,
                'latitude' => 6.5244,
                'longitude' => 3.3792,
            ])
            ->assertCreated();

        $session = FieldActivitySession::query()->where('user_id', $agent->id)->firstOrFail();

        // Simulate device coming back online after 5 hours offline.
        $this->actingAs($agent, 'sanctum')
            ->postJson("/api/v1/agent/field-activity/sessions/{$session->id}/points", [
                'company_id' => $company->id,
                'points' => [[
                    'latitude' => 6.5300,
                    'longitude' => 3.3900,
                    'speed_mps' => 4,
                    'recorded_at' => '2026-07-29T14:00:00+01:00',
                ]],
            ])
            ->assertOk();

        $session->refresh();
        $activeSeconds = (int) $session->travel_seconds + (int) $session->stationary_seconds;

        $this->assertSame(
            900,
            $activeSeconds,
            "Offline gaps must be capped (got {$activeSeconds}).",
        );
    }

    public function test_management_live_hydrate_returns_active_route_and_stops(): void
    {
        [$company, $owner, $agent] = $this->seedCompany();
        $company->forceFill(['field_activity_enabled' => true])->save();
        $this->seedAttendanceSettings($company);

        Carbon::setTestNow(Carbon::parse('2026-07-29 10:00:00', 'Africa/Lagos'));

        $this->actingAs($agent, 'sanctum')
            ->postJson('/api/v1/agent/attendance/clock-in', [
                'company_id' => $company->id,
                'latitude' => 6.5244,
                'longitude' => 3.3792,
                'accuracy_m' => 10,
            ])
            ->assertCreated();

        $session = FieldActivitySession::query()->where('company_id', $company->id)->where('user_id', $agent->id)->firstOrFail();

        FieldLocationPoint::query()->create([
            'field_activity_session_id' => $session->id,
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'latitude' => 6.5300,
            'longitude' => 3.3800,
            'movement_state' => 'moving',
            'recorded_at' => Carbon::parse('2026-07-29 10:15:00', 'Africa/Lagos'),
        ]);

        FieldStop::query()->create([
            'field_activity_session_id' => $session->id,
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'arrived_at' => Carbon::parse('2026-07-29 11:00:00', 'Africa/Lagos'),
            'departed_at' => null,
            'latitude' => 6.53,
            'longitude' => 3.38,
            'duration_seconds' => 900,
            'confidence' => 0.4,
            'match_type' => 'unknown',
            'classification' => 'pending',
        ]);

        $this->actingAs($owner, 'sanctum')
            ->getJson("/api/v1/field-activity/live?company_id={$company->id}&date=2026-07-29")
            ->assertOk()
            ->assertJsonPath('data.date', '2026-07-29')
            ->assertJsonPath('data.agents.0.user_id', $agent->id)
            ->assertJsonPath('data.agents.0.session.id', $session->id);

        $response = $this->actingAs($owner, 'sanctum')
            ->getJson("/api/v1/field-activity/live?company_id={$company->id}&date=2026-07-29")
            ->assertOk();

        $agents = $response->json('data.agents');
        $this->assertIsArray($agents);
        $this->assertCount(1, $agents);
        $this->assertGreaterThanOrEqual(1, count($agents[0]['route']['coordinates'] ?? []));
        $this->assertCount(1, $agents[0]['stops'] ?? []);
    }

    public function test_clock_in_skips_field_session_when_disabled(): void
    {
        [$company, $owner, $agent] = $this->seedCompany();
        $company->forceFill(['field_activity_enabled' => false])->save();
        $this->seedAttendanceSettings($company);

        Carbon::setTestNow(Carbon::parse('2026-07-29 10:00:00', 'Africa/Lagos'));

        $this->actingAs($agent, 'sanctum')
            ->postJson('/api/v1/agent/attendance/clock-in', [
                'company_id' => $company->id,
                'latitude' => 6.5244,
                'longitude' => 3.3792,
            ])
            ->assertCreated();

        $this->assertDatabaseMissing('field_activity_sessions', [
            'company_id' => $company->id,
            'user_id' => $agent->id,
        ]);
    }

    public function test_batch_points_create_stop_after_five_minute_dwell(): void
    {
        [$company, $owner, $agent] = $this->seedCompany();
        $company->forceFill(['field_activity_enabled' => true])->save();
        $this->seedAttendanceSettings($company);
        Carbon::setTestNow(Carbon::parse('2026-07-29 10:00:00', 'Africa/Lagos'));

        $this->actingAs($agent, 'sanctum')
            ->postJson('/api/v1/agent/attendance/clock-in', [
                'company_id' => $company->id,
                'latitude' => 6.5244,
                'longitude' => 3.3792,
            ])
            ->assertCreated();

        $session = FieldActivitySession::query()->where('user_id', $agent->id)->firstOrFail();

        $baseLat = 6.5300;
        $baseLng = 3.3800;
        $points = [];
        // 0..6 minutes of near-stationary samples = 6 minutes dwell (>= 5 min threshold).
        for ($i = 0; $i <= 6; $i++) {
            $points[] = [
                'latitude' => $baseLat + ($i * 0.000001),
                'longitude' => $baseLng,
                'speed_mps' => 0.05,
                'recorded_at' => Carbon::parse('2026-07-29 10:00:00', 'Africa/Lagos')
                    ->addMinutes($i)
                    ->toIso8601String(),
            ];
        }

        $this->actingAs($agent, 'sanctum')
            ->postJson("/api/v1/agent/field-activity/sessions/{$session->id}/points", [
                'company_id' => $company->id,
                'points' => $points,
            ])
            ->assertOk()
            ->assertJsonPath('data.persisted_count', 7);

        $this->assertTrue(
            FieldStop::query()->where('field_activity_session_id', $session->id)->exists(),
            'Expected a confirmed stop after 5+ minutes of stationary points.',
        );
    }

    public function test_incremental_single_point_posts_create_stop_after_five_minute_dwell(): void
    {
        [$company, $owner, $agent] = $this->seedCompany();
        $company->forceFill(['field_activity_enabled' => true])->save();
        $this->seedAttendanceSettings($company);
        Carbon::setTestNow(Carbon::parse('2026-07-29 10:00:00', 'Africa/Lagos'));

        $this->actingAs($agent, 'sanctum')
            ->postJson('/api/v1/agent/attendance/clock-in', [
                'company_id' => $company->id,
                'latitude' => 6.5244,
                'longitude' => 3.3792,
            ])
            ->assertCreated();

        $session = FieldActivitySession::query()->where('user_id', $agent->id)->firstOrFail();
        $baseLat = 6.5310;
        $baseLng = 3.3810;

        for ($i = 0; $i <= 6; $i++) {
            $this->actingAs($agent, 'sanctum')
                ->postJson("/api/v1/agent/field-activity/sessions/{$session->id}/points", [
                    'company_id' => $company->id,
                    'points' => [[
                        'latitude' => $baseLat,
                        'longitude' => $baseLng,
                        'speed_mps' => 0.04,
                        'recorded_at' => Carbon::parse('2026-07-29 10:10:00', 'Africa/Lagos')
                            ->addMinutes($i)
                            ->toIso8601String(),
                    ]],
                ])
                ->assertOk();
        }

        $this->assertTrue(
            FieldStop::query()->where('field_activity_session_id', $session->id)->exists(),
            'Expected a stop even when each GPS sample arrives in its own request.',
        );
    }

    public function test_slow_gps_jitter_inside_radius_still_creates_stop(): void
    {
        [$company, $owner, $agent] = $this->seedCompany();
        $company->forceFill(['field_activity_enabled' => true])->save();
        $this->seedAttendanceSettings($company);
        Carbon::setTestNow(Carbon::parse('2026-07-29 10:00:00', 'Africa/Lagos'));

        $this->actingAs($agent, 'sanctum')
            ->postJson('/api/v1/agent/attendance/clock-in', [
                'company_id' => $company->id,
                'latitude' => 6.5244,
                'longitude' => 3.3792,
            ])
            ->assertCreated();

        $session = FieldActivitySession::query()->where('user_id', $agent->id)->firstOrFail();

        $points = [];
        for ($i = 0; $i <= 6; $i++) {
            $points[] = [
                'latitude' => 6.5162 + ($i * 0.00001),
                'longitude' => 3.3457,
                // ~4.3 km/h — classified SLOW, typical standing GPS jitter.
                'speed_mps' => 1.2,
                'recorded_at' => Carbon::parse('2026-07-29 10:20:00', 'Africa/Lagos')
                    ->addMinutes($i)
                    ->toIso8601String(),
            ];
        }

        $this->actingAs($agent, 'sanctum')
            ->postJson("/api/v1/agent/field-activity/sessions/{$session->id}/points", [
                'company_id' => $company->id,
                'points' => $points,
            ])
            ->assertOk();

        $this->assertTrue(
            FieldStop::query()->where('field_activity_session_id', $session->id)->exists(),
            'Expected a stop when the agent stayed in one place even if GPS labelled samples as slow.',
        );
    }

    public function test_brief_stop_under_five_minutes_does_not_create_stop(): void
    {
        [$company, $owner, $agent] = $this->seedCompany();
        $company->forceFill(['field_activity_enabled' => true])->save();
        $this->seedAttendanceSettings($company);
        Carbon::setTestNow(Carbon::parse('2026-07-29 10:00:00', 'Africa/Lagos'));

        $this->actingAs($agent, 'sanctum')
            ->postJson('/api/v1/agent/attendance/clock-in', [
                'company_id' => $company->id,
                'latitude' => 6.5244,
                'longitude' => 3.3792,
            ])
            ->assertCreated();

        $session = FieldActivitySession::query()->where('user_id', $agent->id)->firstOrFail();

        $points = [];
        // 0..3 minutes = 3 minutes dwell (under the 5 min threshold).
        for ($i = 0; $i <= 3; $i++) {
            $points[] = [
                'latitude' => 6.5400,
                'longitude' => 3.3900,
                'speed_mps' => 0.02,
                'recorded_at' => Carbon::parse('2026-07-29 10:00:00', 'Africa/Lagos')
                    ->addMinutes($i)
                    ->toIso8601String(),
            ];
        }

        $this->actingAs($agent, 'sanctum')
            ->postJson("/api/v1/agent/field-activity/sessions/{$session->id}/points", [
                'company_id' => $company->id,
                'points' => $points,
            ])
            ->assertOk();

        $this->assertDatabaseMissing('field_stops', [
            'field_activity_session_id' => $session->id,
        ]);
    }

    public function test_clock_out_closes_session_and_builds_summary(): void
    {
        [$company, $owner, $agent] = $this->seedCompany();
        $company->forceFill(['field_activity_enabled' => true])->save();
        $this->seedAttendanceSettings($company);
        Carbon::setTestNow(Carbon::parse('2026-07-29 10:00:00', 'Africa/Lagos'));

        $this->actingAs($agent, 'sanctum')
            ->postJson('/api/v1/agent/attendance/clock-in', [
                'company_id' => $company->id,
                'latitude' => 6.5244,
                'longitude' => 3.3792,
            ])
            ->assertCreated();

        Carbon::setTestNow(Carbon::parse('2026-07-29 16:00:00', 'Africa/Lagos'));

        $this->actingAs($agent, 'sanctum')
            ->postJson('/api/v1/agent/attendance/clock-out', [
                'company_id' => $company->id,
                'latitude' => 6.5244,
                'longitude' => 3.3792,
            ])
            ->assertOk();

        $this->assertDatabaseHas('field_activity_sessions', [
            'user_id' => $agent->id,
            'status' => 'completed',
        ]);

        $this->assertTrue(
            \App\Models\FieldDailySummary::query()
                ->where('company_id', $company->id)
                ->where('user_id', $agent->id)
                ->whereDate('summary_date', '2026-07-29')
                ->exists(),
        );
    }

    public function test_classify_stop_writes_crm_visit_activity(): void
    {
        [$company, $owner, $agent] = $this->seedCompany();
        $company->forceFill(['field_activity_enabled' => true])->save();

        $lead = Lead::query()->create([
            'company_id' => $company->id,
            'created_by_user_id' => $owner->id,
            'assigned_to_user_id' => $agent->id,
            'name' => 'Acme Lead',
            'status' => 'contacted',
            'source' => 'test',
        ]);

        $location = CompanyLocation::query()->create([
            'company_id' => $company->id,
            'crm_lead_id' => $lead->id,
            'created_by_user_id' => $owner->id,
            'name' => 'Acme HQ',
            'type' => 'office',
            'address' => 'Lagos',
            'latitude' => 6.55,
            'longitude' => 3.35,
            'is_active' => true,
        ]);
        $lead->forceFill(['company_location_id' => $location->id])->save();

        $record = AttendanceRecord::query()->create([
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'attendance_date' => '2026-07-29',
            'clock_in_at' => Carbon::parse('2026-07-29 09:00:00'),
            'status' => 'present',
        ]);

        $session = FieldActivitySession::query()->create([
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'attendance_record_id' => $record->id,
            'status' => 'completed',
            'started_at' => Carbon::parse('2026-07-29 09:00:00'),
            'ended_at' => Carbon::parse('2026-07-29 17:00:00'),
        ]);

        $stop = FieldStop::query()->create([
            'field_activity_session_id' => $session->id,
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'arrived_at' => Carbon::parse('2026-07-29 11:00:00'),
            'departed_at' => Carbon::parse('2026-07-29 11:30:00'),
            'latitude' => 6.55,
            'longitude' => 3.35,
            'duration_seconds' => 1800,
            'confidence' => 0.2,
            'match_type' => 'unknown',
            'classification' => 'pending',
        ]);

        $this->actingAs($agent, 'sanctum')
            ->postJson("/api/v1/agent/field-activity/stops/{$stop->id}/classify", [
                'company_id' => $company->id,
                'classification' => 'lead_visit',
                'lead_id' => $lead->id,
            ])
            ->assertOk()
            ->assertJsonPath('data.stop.classification', 'lead_visit');

        $this->assertDatabaseHas('lead_activities', [
            'lead_id' => $lead->id,
            'type' => 'visit',
            'company_id' => $company->id,
        ]);
    }

    public function test_management_can_toggle_field_activity_settings(): void
    {
        [$company, $owner] = $this->seedCompany();

        $this->actingAs($owner, 'sanctum')
            ->putJson('/api/v1/field-activity/settings', [
                'company_id' => $company->id,
                'enabled' => true,
            ])
            ->assertOk()
            ->assertJsonPath('data.enabled', true);

        $this->assertTrue((bool) $company->fresh()->field_activity_enabled);
    }

    public function test_auto_clock_out_exposes_pending_review_backlog_on_next_day(): void
    {
        [$company, $owner, $agent] = $this->seedCompany();
        $company->forceFill(['field_activity_enabled' => true])->save();
        $this->seedAttendanceSettings($company);

        Carbon::setTestNow(Carbon::parse('2026-07-29 09:00:00', 'Africa/Lagos'));

        $this->actingAs($agent, 'sanctum')
            ->postJson('/api/v1/agent/attendance/clock-in', [
                'company_id' => $company->id,
                'latitude' => 6.5244,
                'longitude' => 3.3792,
                'accuracy_m' => 10,
            ])
            ->assertCreated();

        $session = FieldActivitySession::query()->where('company_id', $company->id)->where('user_id', $agent->id)->firstOrFail();

        FieldStop::query()->create([
            'field_activity_session_id' => $session->id,
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'arrived_at' => Carbon::parse('2026-07-29 12:00:00', 'Africa/Lagos'),
            'departed_at' => Carbon::parse('2026-07-29 12:30:00', 'Africa/Lagos'),
            'latitude' => 6.53,
            'longitude' => 3.38,
            'duration_seconds' => 1800,
            'confidence' => 0.25,
            'match_type' => 'unknown',
            'classification' => 'pending',
        ]);

        Carbon::setTestNow(Carbon::parse('2026-07-29 18:20:00', 'Africa/Lagos'));
        /** @var AttendanceService $attendanceService */
        $attendanceService = app(AttendanceService::class);
        $attendanceService->autoClockOutForOpenRecords($company->id);

        $this->assertDatabaseHas('field_activity_sessions', [
            'id' => $session->id,
            'status' => 'auto_closed',
        ]);

        Carbon::setTestNow(Carbon::parse('2026-07-30 09:00:00', 'Africa/Lagos'));

        $this->actingAs($agent, 'sanctum')
            ->getJson("/api/v1/agent/field-activity/pending-review?company_id={$company->id}")
            ->assertOk()
            ->assertJsonPath('data.pending_stop_count', 1)
            ->assertJsonPath('data.pending_session_count', 1);

        $this->actingAs($agent, 'sanctum')
            ->getJson("/api/v1/agent/field-activity/today?company_id={$company->id}")
            ->assertOk()
            ->assertJsonPath('data.pending_review.pending_stop_count', 1);
    }

    public function test_manual_clock_out_exposes_pending_review_backlog_on_next_day(): void
    {
        [$company, $owner, $agent] = $this->seedCompany();
        $company->forceFill(['field_activity_enabled' => true])->save();
        $this->seedAttendanceSettings($company);

        Carbon::setTestNow(Carbon::parse('2026-07-29 09:00:00', 'Africa/Lagos'));

        $this->actingAs($agent, 'sanctum')
            ->postJson('/api/v1/agent/attendance/clock-in', [
                'company_id' => $company->id,
                'latitude' => 6.5244,
                'longitude' => 3.3792,
                'accuracy_m' => 10,
            ])
            ->assertCreated();

        $session = FieldActivitySession::query()->where('company_id', $company->id)->where('user_id', $agent->id)->firstOrFail();

        FieldStop::query()->create([
            'field_activity_session_id' => $session->id,
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'arrived_at' => Carbon::parse('2026-07-29 12:00:00', 'Africa/Lagos'),
            'departed_at' => Carbon::parse('2026-07-29 12:30:00', 'Africa/Lagos'),
            'latitude' => 6.53,
            'longitude' => 3.38,
            'duration_seconds' => 1800,
            'confidence' => 0.25,
            'match_type' => 'unknown',
            'classification' => 'pending',
        ]);

        // Agent finishes early and clocks out manually well before closing time.
        Carbon::setTestNow(Carbon::parse('2026-07-29 15:00:00', 'Africa/Lagos'));

        $this->actingAs($agent, 'sanctum')
            ->postJson('/api/v1/agent/attendance/clock-out', [
                'company_id' => $company->id,
                'latitude' => 6.5244,
                'longitude' => 3.3792,
            ])
            ->assertOk();

        $this->assertDatabaseHas('field_activity_sessions', [
            'id' => $session->id,
            'status' => 'completed',
        ]);

        $this->assertTrue(
            \App\Models\FieldDailySummary::query()
                ->where('company_id', $company->id)
                ->where('user_id', $agent->id)
                ->whereDate('summary_date', '2026-07-29')
                ->exists(),
        );

        Carbon::setTestNow(Carbon::parse('2026-07-30 09:00:00', 'Africa/Lagos'));

        $this->actingAs($agent, 'sanctum')
            ->getJson("/api/v1/agent/field-activity/pending-review?company_id={$company->id}")
            ->assertOk()
            ->assertJsonPath('data.pending_stop_count', 1)
            ->assertJsonPath('data.pending_session_count', 1);

        $this->actingAs($agent, 'sanctum')
            ->getJson("/api/v1/agent/field-activity/today?company_id={$company->id}")
            ->assertOk()
            ->assertJsonPath('data.pending_review.pending_stop_count', 1);
    }

    public function test_classification_clears_pending_review_queue(): void
    {
        [$company, $owner, $agent] = $this->seedCompany();
        $company->forceFill(['field_activity_enabled' => true])->save();
        $this->seedAttendanceSettings($company);

        Carbon::setTestNow(Carbon::parse('2026-07-29 09:00:00', 'Africa/Lagos'));

        $this->actingAs($agent, 'sanctum')
            ->postJson('/api/v1/agent/attendance/clock-in', [
                'company_id' => $company->id,
                'latitude' => 6.5244,
                'longitude' => 3.3792,
                'accuracy_m' => 10,
            ])
            ->assertCreated();

        $session = FieldActivitySession::query()->where('company_id', $company->id)->where('user_id', $agent->id)->firstOrFail();

        $stop = FieldStop::query()->create([
            'field_activity_session_id' => $session->id,
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'arrived_at' => Carbon::parse('2026-07-29 12:00:00', 'Africa/Lagos'),
            'departed_at' => Carbon::parse('2026-07-29 12:30:00', 'Africa/Lagos'),
            'latitude' => 6.53,
            'longitude' => 3.38,
            'duration_seconds' => 1800,
            'confidence' => 0.25,
            'match_type' => 'unknown',
            'classification' => 'pending',
        ]);

        Carbon::setTestNow(Carbon::parse('2026-07-29 18:20:00', 'Africa/Lagos'));
        /** @var AttendanceService $attendanceService */
        $attendanceService = app(AttendanceService::class);
        $attendanceService->autoClockOutForOpenRecords($company->id);

        Carbon::setTestNow(Carbon::parse('2026-07-30 09:00:00', 'Africa/Lagos'));

        $this->actingAs($agent, 'sanctum')
            ->getJson("/api/v1/agent/field-activity/pending-review?company_id={$company->id}")
            ->assertOk()
            ->assertJsonPath('data.pending_stop_count', 1)
            ->assertJsonPath('data.pending_session_count', 1);

        $this->actingAs($agent, 'sanctum')
            ->postJson("/api/v1/agent/field-activity/stops/{$stop->id}/classify", [
                'company_id' => $company->id,
                'classification' => 'ignore',
                'source' => 'agent',
            ])
            ->assertOk();

        $this->actingAs($agent, 'sanctum')
            ->getJson("/api/v1/agent/field-activity/pending-review?company_id={$company->id}")
            ->assertOk()
            ->assertJsonPath('data.pending_stop_count', 0)
            ->assertJsonPath('data.pending_session_count', 0);
    }

    /**
     * @return array{0: Company, 1: User, 2: User}
     */
    private function seedCompany(): array
    {
        $company = Company::create([
            'company_id' => 'FAC-FIELD-' . strtoupper((string) fake()->lexify('????')),
            'name' => 'Field Activity Co',
            'country' => 'NG',
            'currency_code' => 'NGN',
            'team_size' => '11-50',
            'use_case' => 'Field activity testing',
            'status' => 'active',
            'activated_at' => now(),
            'field_activity_enabled' => false,
        ]);

        $owner = User::factory()->create(['internal_role' => null, 'is_active' => true]);
        $agent = User::factory()->create(['internal_role' => 'agent', 'is_active' => true]);

        DB::table('company_users')->insert([
            [
                'company_id' => $company->id,
                'user_id' => $owner->id,
                'role' => 'owner',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'company_id' => $company->id,
                'user_id' => $agent->id,
                'role' => 'agent',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        return [$company, $owner, $agent];
    }

    private function seedAttendanceSettings(Company $company): void
    {
        AttendanceSetting::query()->create([
            'company_id' => $company->id,
            'opening_time' => '08:00:00',
            'closing_time' => '18:00:00',
            'working_days' => ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
            'clockin_window_minutes' => 60,
            'auto_clockout_enabled' => true,
            'timezone' => 'Africa/Lagos',
        ]);
    }
}
