<?php

declare(strict_types=1);

namespace Tests\Feature\FieldActivity;

use App\Enums\FieldStopClassification;
use App\Enums\FieldStopMatchType;
use App\Jobs\ProcessFieldStopsJob;
use App\Models\AgentLocationSnapshot;
use App\Models\AttendanceSetting;
use App\Models\Company;
use App\Models\FieldActivitySession;
use App\Models\FieldDailySummary;
use App\Models\FieldLocationPoint;
use App\Models\FieldStop;
use App\Models\User;
use App\Services\AI\Providers\AiProviderRouter;
use App\Services\AI\Tools\ReadToolRegistry;
use App\Services\FieldActivity\FieldActivityAlertService;
use App\Services\FieldActivity\FieldActivityAnalyticsService;
use App\Services\FieldActivity\FieldActivityElyService;
use App\Services\FieldActivity\FieldActivityRealtimeService;
use App\Services\FieldActivity\FieldActivitySessionService;
use App\Services\FieldActivity\FieldTripService;
use App\Services\Location\MapboxGeocodingService;
use Carbon\Carbon;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Mockery;
use Tests\TestCase;

/**
 * Production hardening of field trip tracking (Phase 1 backend).
 * One test (or more) per audit item; the item number is in the test name.
 */
class FieldTripHardeningTest extends TestCase
{
    use RefreshDatabase;

    private const LAT = 6.5244;
    private const LNG = 3.3792;

    /** ~11 m of latitude. */
    private const DEG_10M = 0.0001;

    protected function setUp(): void
    {
        parent::setUp();

        Config::set('field_activity.stop_radius_meters', 50);
        Config::set('field_activity.persist_min_interval_seconds', 0);
        Config::set('field_activity.persist_min_distance_meters', 0);
        Config::set('field_activity.auto_classify_min_confidence', 0.95);

        $geo = Mockery::mock(MapboxGeocodingService::class);
        $geo->shouldReceive('reverseGeocodeCoordinates')->andReturn(['place_name' => 'Test Address, Lagos']);
        $this->app->instance(MapboxGeocodingService::class, $geo);

        $ai = Mockery::mock(AiProviderRouter::class);
        $ai->shouldReceive('generateForPurpose')->andReturn(null);
        $this->app->instance(AiProviderRouter::class, $ai);

        Carbon::setTestNow(Carbon::parse('2026-11-25 09:00:00'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    // ── P0 1: phantom distance, accuracy and jump filters ────────────────

    public function test_item01_standing_still_with_gps_jitter_adds_no_distance(): void
    {
        $f = $this->seedCompany();
        $id = $this->startTrip($f['agent'], $f['company'])->json('data.trip.id');
        Carbon::setTestNow(Carbon::parse('2026-11-25 10:00:00'));

        // 15 minutes of ±22 m jitter, no device speed (the old code added each hop).
        $points = [];
        for ($i = 1; $i <= 30; $i++) {
            $points[] = $this->pt($i * 30, ($i % 2 === 0 ? 2 : -2) * self::DEG_10M, null, 15);
        }
        $this->sendRaw($f['agent'], $f['company'], $id, $points)->assertOk();

        $trip = FieldActivitySession::query()->findOrFail($id);
        $this->assertSame(0, (int) $trip->distance_meters);
        $this->assertSame(900, (int) $trip->travel_seconds + (int) $trip->stationary_seconds);
    }

    public function test_item01_real_movement_is_still_counted(): void
    {
        $f = $this->seedCompany();
        $id = $this->startTrip($f['agent'], $f['company'])->json('data.trip.id');
        Carbon::setTestNow(Carbon::parse('2026-11-25 10:00:00'));

        // 10 steps of ~111 m every 30 s.
        $points = array_map(fn (int $i): array => $this->pt($i * 30, $i * 0.001, 3.7, 10), range(1, 10));
        $this->sendRaw($f['agent'], $f['company'], $id, $points)->assertOk();

        $distance = (int) FieldActivitySession::query()->findOrFail($id)->distance_meters;
        $this->assertGreaterThan(1050, $distance);
        $this->assertLessThan(1160, $distance);
    }

    public function test_item01_inaccurate_fixes_and_impossible_jumps_are_rejected(): void
    {
        $f = $this->seedCompany();
        $id = $this->startTrip($f['agent'], $f['company'])->json('data.trip.id');
        Carbon::setTestNow(Carbon::parse('2026-11-25 10:00:00'));

        $this->sendRaw($f['agent'], $f['company'], $id, [$this->pt(60, 0.001, 2.0, 10)])
            ->assertOk()->assertJsonPath('data.persisted_count', 1);

        // 400 m accuracy, then 55 km in one minute (≈ 900 m/s).
        $this->sendRaw($f['agent'], $f['company'], $id, [
            $this->pt(90, 0.0012, 2.0, 400),
            $this->pt(120, 0.5, 2.0, 10),
        ])->assertOk()
            ->assertJsonPath('data.persisted_count', 0)
            ->assertJsonPath('data.rejected_count', 2);

        $trip = FieldActivitySession::query()->findOrFail($id);
        $this->assertEqualsWithDelta(self::LAT + 0.001, (float) $trip->last_latitude, 0.000001);
        $this->assertLessThan(200, (int) $trip->distance_meters);
        $this->assertSame(2, FieldLocationPoint::query()->where('field_activity_session_id', $id)->count());
    }

    // ── P0 2: ELY privacy ────────────────────────────────────────────────

    public function test_item02_ely_supervisor_only_sees_own_team_and_self(): void
    {
        $f = $this->seedCompany();
        $this->startTrip($f['agent'], $f['company']);
        $this->startTrip($f['otherAgent'], $f['company']);
        $this->startTrip($f['supervisor'], $f['company']);
        $ely = app(FieldActivityElyService::class);
        $companyId = (int) $f['company']->id;

        $denied = $ely->dailySummary($f['supervisor'], $companyId, ['user_id' => $f['otherAgent']->id]);
        $this->assertFalse($denied['payload']['authorized']);

        $allowed = $ely->dailySummary($f['supervisor'], $companyId, ['user_id' => $f['agent']->id]);
        $this->assertSame((int) $f['agent']->id, $allowed['payload']['user_id']);

        $team = $ely->dailySummary($f['supervisor'], $companyId, []);
        $ids = array_column($team['payload']['agents'], 'user_id');
        sort($ids);
        $expected = [(int) $f['supervisor']->id, (int) $f['agent']->id];
        sort($expected);
        $this->assertSame($expected, $ids);

        $this->assertFalse($ely->agentVisits($f['supervisor'], $companyId, ['user_id' => $f['otherAgent']->id])['payload']['authorized']);
        $this->assertFalse($ely->travelVsVisitTime($f['supervisor'], $companyId, ['user_id' => $f['otherAgent']->id])['payload']['authorized']);

        // Owners still see everyone.
        $ownerTeam = $ely->dailySummary($f['owner'], $companyId, []);
        $this->assertCount(3, $ownerTeam['payload']['agents']);

        // tracking.agent_history (ReadToolRegistry).
        $history = app(ReadToolRegistry::class)->execute('tracking.agent_history', $f['supervisor'], $companyId, ['agent_id' => $f['otherAgent']->id]);
        $this->assertFalse($history['payload']['authorized']);
        $own = app(ReadToolRegistry::class)->execute('tracking.agent_history', $f['supervisor'], $companyId, ['agent_id' => $f['agent']->id]);
        $this->assertSame((int) $f['agent']->id, $own['payload']['agent_id']);
    }

    // ── P0 3: out-of-order points ────────────────────────────────────────

    public function test_item03_older_points_go_on_the_trail_only(): void
    {
        $f = $this->seedCompany();
        $id = $this->startTrip($f['agent'], $f['company'])->json('data.trip.id');
        Carbon::setTestNow(Carbon::parse('2026-11-25 10:00:00'));

        $this->sendRaw($f['agent'], $f['company'], $id, [$this->pt(600, 0.002, 2.0, 10)])->assertOk();
        $before = FieldActivitySession::query()->findOrFail($id);

        // A point recorded 5 minutes earlier arrives late, 5 km away.
        $this->sendRaw($f['agent'], $f['company'], $id, [$this->pt(300, 0.05, 2.0, 10)])
            ->assertOk()->assertJsonPath('data.persisted_count', 1);

        $after = FieldActivitySession::query()->findOrFail($id);
        $this->assertSame((float) $before->last_latitude, (float) $after->last_latitude);
        $this->assertTrue($before->last_recorded_at->equalTo($after->last_recorded_at));
        $this->assertSame((int) $before->distance_meters, (int) $after->distance_meters);
        $this->assertSame(3, FieldLocationPoint::query()->where('field_activity_session_id', $id)->count());

        $snapshot = AgentLocationSnapshot::query()->where('user_id', $f['agent']->id)->firstOrFail();
        $this->assertEqualsWithDelta(self::LAT + 0.002, (float) $snapshot->latitude, 0.000001);
    }

    // ── P1 4: gated points keep distance and time ────────────────────────

    public function test_item04_gated_samples_still_count_distance_and_time(): void
    {
        Config::set('field_activity.persist_min_interval_seconds', 30);
        Config::set('field_activity.persist_min_distance_meters', 20);
        $f = $this->seedCompany();
        $id = $this->startTrip($f['agent'], $f['company'])->json('data.trip.id');
        Carbon::setTestNow(Carbon::parse('2026-11-25 10:00:00'));

        // Walking ~15 m every 10 s for 5 minutes (450 m).
        $points = array_map(fn (int $i): array => $this->pt($i * 10, $i * 0.000135, 1.5, 5), range(1, 30));
        $this->sendRaw($f['agent'], $f['company'], $id, $points)->assertOk();

        $trip = FieldActivitySession::query()->findOrFail($id);
        $stored = FieldLocationPoint::query()->where('field_activity_session_id', $id)->count();
        $this->assertLessThan(31, $stored, 'Some samples were thinned out of the trail.');
        $this->assertSame(300, (int) $trip->travel_seconds + (int) $trip->stationary_seconds);
        $this->assertGreaterThan(400, (int) $trip->distance_meters);
        $this->assertLessThan(460, (int) $trip->distance_meters);
    }

    // ── P1 5: late points after auto-end ─────────────────────────────────

    public function test_item05_auto_ended_trip_accepts_buffered_points_within_grace(): void
    {
        $f = $this->seedCompany();
        $id = $this->startTrip($f['agent'], $f['company'])->json('data.trip.id');
        Carbon::setTestNow(Carbon::parse('2026-11-25 09:05:00'));
        $this->sendRaw($f['agent'], $f['company'], $id, [$this->pt(300, 0.001, 2.0, 10)])->assertOk();

        Carbon::setTestNow(Carbon::parse('2026-11-25 11:10:00'));
        $this->assertSame(1, app(FieldTripService::class)->monitor()['auto_ended']);
        $trip = FieldActivitySession::query()->findOrFail($id);
        $this->assertSame('auto_no_signal', $trip->end_reason);
        $this->assertTrue($trip->ended_at->equalTo(Carbon::parse('2026-11-25 09:05:00')));

        // The phone comes back with what it buffered: 09:06–09:14 is inside the
        // 10-minute grace, 09:30 is not.
        $late = array_map(fn (int $m): array => $this->pt($m * 60, 0.001 + ($m - 5) * 0.001, 3.0, 10), range(6, 14));
        $late[] = $this->pt(30 * 60, 0.02, 3.0, 10);
        $this->sendRaw($f['agent'], $f['company'], $id, $late)
            ->assertOk()
            ->assertJsonPath('data.persisted_count', 9)
            ->assertJsonPath('data.rejected_count', 1);

        $trip = FieldActivitySession::query()->findOrFail($id);
        $this->assertSame('auto_closed', $trip->status->value);
        $this->assertTrue($trip->ended_at->equalTo(Carbon::parse('2026-11-25 09:14:00')));
        $this->assertGreaterThan(900, (int) $trip->distance_meters);
        $this->assertSame(
            (int) $trip->distance_meters,
            (int) FieldDailySummary::query()->where('user_id', $f['agent']->id)->value('distance_meters'),
            'The daily summary is rebuilt with the late points.',
        );
    }

    public function test_item05_user_ended_trip_still_refuses_points(): void
    {
        $f = $this->seedCompany();
        $id = $this->startTrip($f['agent'], $f['company'])->json('data.trip.id');
        Carbon::setTestNow(Carbon::parse('2026-11-25 09:30:00'));
        $this->endTrip($f['agent'], $f['company'], $id)->assertOk();

        $this->sendRaw($f['agent'], $f['company'], $id, [$this->pt(600, 0.001, 2.0, 10)])
            ->assertStatus(422)
            ->assertJsonPath('errors.session.0', 'Field activity session is not active.');
    }

    // ── P1 6: clock skew ─────────────────────────────────────────────────

    public function test_item06_monitor_uses_server_receive_time_not_device_clock(): void
    {
        $f = $this->seedCompany();
        $id = $this->startTrip($f['agent'], $f['company'])->json('data.trip.id');

        // Phone clock is 3 hours behind: points look ancient but arrive live.
        Carbon::setTestNow(Carbon::parse('2026-11-25 12:00:00'));
        $this->sendRaw($f['agent'], $f['company'], $id, [$this->pt(60, 0.0005, 1.0, 10)])->assertOk();

        Carbon::setTestNow(Carbon::parse('2026-11-25 12:05:00'));
        $result = app(FieldTripService::class)->monitor();
        $this->assertSame(0, $result['signal_lost']);
        $this->assertSame(0, $result['auto_ended']);
        $trip = FieldActivitySession::query()->findOrFail($id);
        $this->assertSame('active', $trip->status->value);
        $this->assertTrue($trip->last_received_at->equalTo(Carbon::parse('2026-11-25 12:00:00')));
    }

    // ── P1 7: races ──────────────────────────────────────────────────────

    public function test_item07_trip_ended_is_published_once(): void
    {
        $f = $this->seedCompany();
        $id = $this->startTrip($f['agent'], $f['company'])->json('data.trip.id');
        $realtime = $this->spy(FieldActivityRealtimeService::class);
        Carbon::setTestNow(Carbon::parse('2026-11-25 09:30:00'));

        $this->endTrip($f['agent'], $f['company'], $id)->assertOk()->assertJsonPath('data.trip.status', 'completed');
        $this->endTrip($f['agent'], $f['company'], $id)->assertOk()->assertJsonPath('data.trip.status', 'completed');
        $this->assertNull(app(FieldActivitySessionService::class)->completeSessionIfActive(FieldActivitySession::query()->findOrFail($id)));

        $realtime->shouldHaveReceived('publishTripLifecycle')->with(Mockery::any(), 'trip_ended')->once();
    }

    // ── P1 8: one active trip per user per company; 409 on conflict ──────

    public function test_item08_a_user_can_run_one_trip_in_each_company(): void
    {
        $f = $this->seedCompany();
        $second = $this->makeCompany('FAC-TRIP-2');
        DB::table('company_users')->insert([
            'company_id' => $second->id, 'user_id' => $f['agent']->id, 'role' => 'agent',
            'joined_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->startTrip($f['agent'], $f['company'])->assertCreated();
        $this->startTrip($f['agent'], $second)->assertCreated();

        $this->assertSame(2, FieldActivitySession::query()->where('user_id', $f['agent']->id)->where('status', 'active')->count());
    }

    public function test_item08_genuine_start_conflict_is_a_409(): void
    {
        $f = $this->seedCompany();
        FieldActivitySession::creating(static function (): void {
            throw new QueryException('sqlite', 'insert into field_activity_sessions', [], new \PDOException('UNIQUE constraint failed: field_activity_sessions.user_id'));
        });

        $this->startTrip($f['agent'], $f['company'])
            ->assertStatus(409)
            ->assertJsonPath('message', 'Another field trip is already running for your account. End it before starting a new one.');
    }

    // ── P1 9: managers' stops ────────────────────────────────────────────

    public function test_item09_and_15_managers_list_and_classify_their_own_stops(): void
    {
        $f = $this->seedCompany();
        $realtime = $this->spy(FieldActivityRealtimeService::class);
        $id = $this->startTrip($f['supervisor'], $f['company'])->json('data.trip.id');
        Carbon::setTestNow(Carbon::parse('2026-11-25 10:00:00'));
        $this->sendMinutes($f['supervisor'], $f['company'], $id, range(1, 7))->assertOk();

        $stops = $this->actingAs($f['supervisor'], 'sanctum')
            ->getJson("/api/v1/field-trips/{$id}/stops?company_id={$f['company']->id}")
            ->assertOk()
            ->json('data.stops');
        $this->assertCount(1, $stops);
        $stopId = $stops[0]['id'];

        // Someone else's stop: refused, even for the owner.
        $this->actingAs($f['owner'], 'sanctum')
            ->postJson("/api/v1/field-trips/stops/{$stopId}/classify", ['company_id' => $f['company']->id, 'classification' => 'personal'])
            ->assertStatus(422);

        $this->actingAs($f['supervisor'], 'sanctum')
            ->postJson("/api/v1/field-trips/stops/{$stopId}/classify", ['company_id' => $f['company']->id, 'classification' => 'personal'])
            ->assertOk()
            ->assertJsonPath('data.stop.classification', 'personal');

        $this->actingAs($f['supervisor'], 'sanctum')
            ->getJson("/api/v1/field-trips/today?company_id={$f['company']->id}")
            ->assertOk()
            ->assertJsonCount(1, 'data.stops');
        $this->actingAs($f['supervisor'], 'sanctum')
            ->getJson("/api/v1/field-trips/pending-review?company_id={$f['company']->id}")
            ->assertOk()
            ->assertJsonPath('data.pending_stop_count', 0);

        // P1 15: stop events.
        $realtime->shouldHaveReceived('publishStopUpdated')->atLeast()->once();
    }

    // ── P1 10: alerts reach the right people once each ───────────────────

    public function test_item10_long_stationary_alert_goes_to_admins_and_own_supervisor(): void
    {
        $f = $this->seedCompany();
        $id = $this->startTrip($f['agent'], $f['company'])->json('data.trip.id');
        $this->makeStop($f['agent'], $id, Carbon::parse('2026-11-25 04:00:00'));

        app(FieldActivityAlertService::class)->scanCompany($f['company']);
        app(FieldActivityAlertService::class)->scanCompany($f['company']);

        foreach (['owner', 'admin', 'supervisor'] as $role) {
            $this->assertSame(1, $this->countNotifications($f[$role], 'field_activity.long_stationary'), $role);
        }
        $this->assertSame(0, $this->countNotifications($f['otherSupervisor'], 'field_activity.long_stationary'));
        $this->assertSame(0, $this->countNotifications($f['agent'], 'field_activity.long_stationary'));
    }

    public function test_item10_signal_lost_and_auto_end_also_notify_managers(): void
    {
        $f = $this->seedCompany();
        $this->startTrip($f['agent'], $f['company']);

        Carbon::setTestNow(Carbon::parse('2026-11-25 09:20:00'));
        app(FieldTripService::class)->monitor();
        Carbon::setTestNow(Carbon::parse('2026-11-25 11:05:00'));
        app(FieldTripService::class)->monitor();

        foreach (['agent', 'owner', 'admin', 'supervisor'] as $role) {
            $this->assertSame(1, $this->countNotifications($f[$role], 'field_trip.signal_lost'), $role);
            $this->assertSame(1, $this->countNotifications($f[$role], 'field_trip.auto_ended'), $role);
        }
        $this->assertSame(0, $this->countNotifications($f['otherSupervisor'], 'field_trip.signal_lost'));
        $this->assertDatabaseHas('app_notifications', ['user_id' => $f['supervisor']->id, 'type' => 'field_trip.signal_lost', 'action_url' => '/map']);
    }

    // ── P1 11: company time zone ─────────────────────────────────────────

    public function test_item11_today_and_daily_summaries_follow_the_company_time_zone(): void
    {
        $f = $this->seedCompany();
        AttendanceSetting::query()->create([
            'company_id' => $f['company']->id,
            'opening_time' => '08:00:00',
            'closing_time' => '18:00:00',
            'working_days' => ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
            'clockin_window_minutes' => 60,
            'auto_clockout_enabled' => true,
            'timezone' => 'Africa/Lagos',
        ]);

        // 22:50 London = 23:50 in Lagos (25th).
        Carbon::setTestNow(Carbon::parse('2026-11-25 22:50:00'));
        $first = $this->startTrip($f['agent'], $f['company'])->json('data.trip.id');
        Carbon::setTestNow(Carbon::parse('2026-11-25 23:00:00'));
        $this->endTrip($f['agent'], $f['company'], $first)->assertOk();

        // 23:30 London = 00:30 on the 26th in Lagos: a new company day.
        Carbon::setTestNow(Carbon::parse('2026-11-25 23:30:00'));
        $second = $this->startTrip($f['agent'], $f['company'])->json('data.trip.id');

        $this->actingAs($f['agent'], 'sanctum')
            ->getJson("/api/v1/field-trips/current?company_id={$f['company']->id}")
            ->assertOk()
            ->assertJsonPath('data.today.trip_count', 1);

        Carbon::setTestNow(Carbon::parse('2026-11-25 23:40:00'));
        $this->endTrip($f['agent'], $f['company'], $second)->assertOk();

        $dates = FieldDailySummary::query()->where('user_id', $f['agent']->id)->orderBy('summary_date')
            ->pluck('summary_date')->map(fn ($d) => Carbon::parse($d)->toDateString())->all();
        $this->assertSame(['2026-11-25', '2026-11-26'], $dates);

        $this->actingAs($f['agent'], 'sanctum')
            ->getJson("/api/v1/field-trips/today?company_id={$f['company']->id}")
            ->assertOk()
            ->assertJsonPath('data.date', '2026-11-26')
            ->assertJsonCount(1, 'data.sessions');
    }

    // ── P1 12: performance ───────────────────────────────────────────────

    public function test_item12_ingest_queues_stop_detection(): void
    {
        $f = $this->seedCompany();
        $id = $this->startTrip($f['agent'], $f['company'])->json('data.trip.id');
        Bus::fake([ProcessFieldStopsJob::class]);
        Carbon::setTestNow(Carbon::parse('2026-11-25 10:00:00'));

        $this->sendMinutes($f['agent'], $f['company'], $id, range(1, 7))->assertOk();

        Bus::assertDispatched(ProcessFieldStopsJob::class, fn (ProcessFieldStopsJob $job): bool => $job->sessionId === $id);
        $this->assertFalse(FieldStop::query()->where('field_activity_session_id', $id)->exists(), 'Detection ran in the job, not the request.');
    }

    public function test_item12_reverse_geocode_is_cached_per_place(): void
    {
        $geo = Mockery::mock(MapboxGeocodingService::class);
        $geo->shouldReceive('reverseGeocodeCoordinates')->once()->andReturn(['place_name' => 'Cached Street, Lagos']);
        $this->app->instance(MapboxGeocodingService::class, $geo);

        $f = $this->seedCompany();
        // Two trips back to back with stops: no report required in between.
        $f['company']->forceFill(['field_trip_report_policy' => 'optional'])->save();
        foreach ([['09:00', '10:00', '10:10'], ['11:00', '12:00', '12:10']] as [$start, $send, $end]) {
            Carbon::setTestNow(Carbon::parse("2026-11-25 {$start}:00"));
            $id = $this->startTrip($f['agent'], $f['company'])->json('data.trip.id');
            Carbon::setTestNow(Carbon::parse("2026-11-25 {$send}:00"));
            $base = Carbon::parse("2026-11-25 {$start}:00");
            $points = array_map(fn (int $m): array => [
                'latitude' => self::LAT, 'longitude' => self::LNG, 'speed_mps' => 0.05, 'accuracy_meters' => 8,
                'recorded_at' => $base->copy()->addMinutes($m)->toIso8601String(),
            ], range(1, 7));
            $this->sendRaw($f['agent'], $f['company'], $id, $points)->assertOk();
            Carbon::setTestNow(Carbon::parse("2026-11-25 {$end}:00"));
            $this->endTrip($f['agent'], $f['company'], $id)->assertOk();
        }

        $this->assertSame(2, FieldStop::query()->where('user_id', $f['agent']->id)->where('address', 'Cached Street, Lagos')->count());
    }

    public function test_item12_live_map_route_is_thinned_in_sql(): void
    {
        $f = $this->seedCompany();
        $id = $this->startTrip($f['agent'], $f['company'])->json('data.trip.id');

        $rows = [];
        for ($i = 1; $i <= 1000; $i++) {
            $rows[] = [
                'field_activity_session_id' => $id, 'company_id' => $f['company']->id, 'user_id' => $f['agent']->id,
                'latitude' => self::LAT + $i * 0.00001, 'longitude' => self::LNG, 'movement_state' => 'moving',
                'recorded_at' => Carbon::parse('2026-11-25 09:00:00')->addSeconds($i * 5)->format('Y-m-d H:i:s'),
                'created_at' => now(), 'updated_at' => now(),
            ];
        }
        foreach (array_chunk($rows, 200) as $chunk) {
            FieldLocationPoint::query()->insert($chunk);
        }

        $route = $this->actingAs($f['owner'], 'sanctum')
            ->getJson("/api/v1/field-activity/live?company_id={$f['company']->id}")
            ->assertOk()
            ->json('data.agents.0.route');

        $this->assertSame(1001, $route['raw_point_count']);
        $this->assertLessThanOrEqual(401, $route['point_count']);
        $this->assertGreaterThan(300, $route['point_count']);
        $this->assertEqualsWithDelta(self::LAT + 0.01, end($route['coordinates'])[1], 0.000001, 'The last point is always drawn.');
    }

    public function test_item12_analytics_days_are_distinct_dates(): void
    {
        $f = $this->seedCompany();
        $a = $this->startTrip($f['agent'], $f['company'])->json('data.trip.id');
        Carbon::setTestNow(Carbon::parse('2026-11-25 10:00:00'));
        $this->endTrip($f['agent'], $f['company'], $a)->assertOk();
        Carbon::setTestNow(Carbon::parse('2026-11-25 11:00:00'));
        $this->startTrip($f['agent'], $f['company'])->assertCreated();

        $overview = app(FieldActivityAnalyticsService::class)->companyOverview($f['company'], '2026-11-25', '2026-11-25');
        $this->assertSame(2, $overview['totals']['active_sessions']);
        $this->assertSame(1, $overview['agents'][0]['days']);

        // Ranges are capped.
        $wide = app(FieldActivityAnalyticsService::class)->companyOverview($f['company'], '2020-01-01', '2026-11-25');
        $this->assertSame(Carbon::parse('2026-11-25')->subDays(FieldActivityAnalyticsService::MAX_RANGE_DAYS)->toDateString(), $wide['from']);
    }

    // ── P1 13: day views include every trip ──────────────────────────────

    public function test_item13_today_includes_every_trip_of_the_day(): void
    {
        $f = $this->seedCompany();
        // Two trips back to back with stops: no report required in between.
        $f['company']->forceFill(['field_trip_report_policy' => 'optional'])->save();
        foreach ([['09:00', '10:00', '10:10'], ['11:00', '12:00', '12:10']] as [$start, $send, $end]) {
            Carbon::setTestNow(Carbon::parse("2026-11-25 {$start}:00"));
            $id = $this->startTrip($f['agent'], $f['company'])->json('data.trip.id');
            Carbon::setTestNow(Carbon::parse("2026-11-25 {$send}:00"));
            $base = Carbon::parse("2026-11-25 {$start}:00");
            $points = array_map(fn (int $m): array => [
                'latitude' => self::LAT, 'longitude' => self::LNG, 'speed_mps' => 0.05,
                'recorded_at' => $base->copy()->addMinutes($m)->toIso8601String(),
            ], range(1, 7));
            $this->sendRaw($f['agent'], $f['company'], $id, $points)->assertOk();
            Carbon::setTestNow(Carbon::parse("2026-11-25 {$end}:00"));
            $this->endTrip($f['agent'], $f['company'], $id)->assertOk();
        }

        $this->actingAs($f['agent'], 'sanctum')
            ->getJson("/api/v1/agent/field-activity/today?company_id={$f['company']->id}")
            ->assertOk()
            ->assertJsonCount(2, 'data.sessions')
            ->assertJsonCount(2, 'data.stops');

        $summary = app(FieldActivityElyService::class)->dailySummary($f['agent'], (int) $f['company']->id, []);
        $this->assertCount(2, $summary['payload']['sessions']);
    }

    // ── P1 14: switching off; ignored task ids ───────────────────────────

    public function test_item14_turning_field_activity_off_ends_running_trips(): void
    {
        $f = $this->seedCompany();
        $id = $this->startTrip($f['agent'], $f['company'])->json('data.trip.id');
        Carbon::setTestNow(Carbon::parse('2026-11-25 09:30:00'));

        $this->actingAs($f['owner'], 'sanctum')
            ->putJson('/api/v1/field-activity/settings', ['company_id' => $f['company']->id, 'enabled' => false])
            ->assertOk();

        $trip = FieldActivitySession::query()->findOrFail($id);
        $this->assertSame('auto_closed', $trip->status->value);
        $this->assertSame(FieldActivitySession::END_REASON_DISABLED, $trip->end_reason);
        $this->assertNotNull(FieldDailySummary::query()->where('user_id', $f['agent']->id)->first());
    }

    public function test_item14_unknown_task_ids_on_points_do_not_fail_the_batch(): void
    {
        $f = $this->seedCompany();
        $id = $this->startTrip($f['agent'], $f['company'])->json('data.trip.id');
        Carbon::setTestNow(Carbon::parse('2026-11-25 10:00:00'));

        $point = $this->pt(60, 0.001, 2.0, 10) + ['task_id' => 999999, 'task_tracking_session_id' => 888888];
        $this->sendRaw($f['agent'], $f['company'], $id, [$point])->assertOk()->assertJsonPath('data.persisted_count', 1);
        $this->assertNull(FieldLocationPoint::query()->where('field_activity_session_id', $id)->latest('id')->value('task_id'));
    }

    // ── P1 16: no desktop positions on phone trips ───────────────────────

    public function test_item16_legacy_agent_endpoint_refuses_field_trip_points(): void
    {
        $f = $this->seedCompany();
        $id = $this->startTrip($f['agent'], $f['company'])->json('data.trip.id');
        Carbon::setTestNow(Carbon::parse('2026-11-25 10:00:00'));

        $this->actingAs($f['agent'], 'sanctum')
            ->postJson("/api/v1/agent/field-activity/sessions/{$id}/points", [
                'company_id' => $f['company']->id,
                'points' => [$this->pt(60, 0.001, 2.0, 10)],
            ])
            ->assertStatus(422)
            ->assertJsonPath('errors.session.0', 'Field trip locations are only accepted from the mobile app.');

        $this->assertSame(1, FieldLocationPoint::query()->where('field_activity_session_id', $id)->count());
    }

    // ── P2 ───────────────────────────────────────────────────────────────

    public function test_p2_supervisor_sees_own_live_snapshot(): void
    {
        $f = $this->seedCompany();
        $id = $this->startTrip($f['supervisor'], $f['company'])->json('data.trip.id');
        Carbon::setTestNow(Carbon::parse('2026-11-25 09:05:00'));
        $this->sendRaw($f['supervisor'], $f['company'], $id, [$this->pt(240, 0.001, 2.0, 10)])->assertOk();

        $ids = collect($this->actingAs($f['supervisor'], 'sanctum')
            ->getJson("/api/v1/agents/locations?company_id={$f['company']->id}")
            ->assertOk()
            ->json('data.items'))->pluck('agent.id')->all();

        $this->assertContains($f['supervisor']->id, $ids);
    }

    public function test_p2_prune_removes_old_daily_summaries(): void
    {
        $f = $this->seedCompany();
        foreach (['2025-09-01', '2026-11-01'] as $date) {
            FieldDailySummary::query()->create([
                'company_id' => $f['company']->id, 'user_id' => $f['agent']->id, 'summary_date' => $date,
            ]);
        }

        $this->artisan('field-activity:prune')->assertSuccessful();

        $left = FieldDailySummary::query()->pluck('summary_date')->map(fn ($d) => Carbon::parse($d)->toDateString())->all();
        $this->assertSame(['2026-11-01'], $left);
    }

    // ── helpers ──────────────────────────────────────────────────────────

    private function countNotifications(User $user, string $type): int
    {
        return DB::table('app_notifications')->where('user_id', $user->id)->where('type', $type)->count();
    }

    private function makeStop(User $user, int $sessionId, Carbon $arrivedAt): FieldStop
    {
        return FieldStop::query()->create([
            'field_activity_session_id' => $sessionId,
            'company_id' => FieldActivitySession::query()->findOrFail($sessionId)->company_id,
            'user_id' => $user->id,
            'arrived_at' => $arrivedAt,
            'latitude' => self::LAT,
            'longitude' => self::LNG,
            'duration_seconds' => 0,
            'confidence' => 0,
            'match_type' => FieldStopMatchType::UNKNOWN,
            'classification' => FieldStopClassification::PENDING,
        ]);
    }

    /**
     * @param  array<string, mixed>  $extra
     */
    private function startTrip(User $user, Company $company, array $extra = []): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($user, 'sanctum')->postJson('/api/v1/field-trips', [
            'company_id' => $company->id,
            'latitude' => self::LAT,
            'longitude' => self::LNG,
            'accuracy_meters' => 8,
            ...$extra,
        ]);
    }

    private function endTrip(User $user, Company $company, int $tripId): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($user, 'sanctum')->postJson("/api/v1/field-trips/{$tripId}/end", [
            'company_id' => $company->id,
        ]);
    }

    /**
     * Stationary points at the start position, minutes after 09:00.
     *
     * @param  list<int>  $minutes
     */
    private function sendMinutes(User $user, Company $company, int $tripId, array $minutes): \Illuminate\Testing\TestResponse
    {
        return $this->sendRaw($user, $company, $tripId, array_map(fn (int $m): array => $this->pt($m * 60, 0.0, 0.05, 8), $minutes));
    }

    /**
     * @param  list<array<string, mixed>>  $points
     */
    private function sendRaw(User $user, Company $company, int $tripId, array $points): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($user, 'sanctum')->postJson("/api/v1/field-trips/{$tripId}/points", [
            'company_id' => $company->id,
            'points' => $points,
        ]);
    }

    /**
     * A point $seconds after 09:00, $dLat degrees north of the start.
     *
     * @return array<string, mixed>
     */
    private function pt(int $seconds, float $dLat, ?float $speed, ?float $accuracy): array
    {
        return array_filter([
            'latitude' => self::LAT + $dLat,
            'longitude' => self::LNG,
            'speed_mps' => $speed,
            'accuracy_meters' => $accuracy,
            'recorded_at' => Carbon::parse('2026-11-25 09:00:00')->addSeconds($seconds)->toIso8601String(),
        ], static fn ($v): bool => $v !== null);
    }

    private function makeCompany(string $code, bool $enabled = true): Company
    {
        return Company::create([
            'company_id' => $code.'-'.strtoupper((string) fake()->lexify('????')),
            'name' => 'Field Trip Co',
            'country' => 'NG',
            'currency_code' => 'NGN',
            'team_size' => '11-50',
            'use_case' => 'Field trip testing',
            'status' => 'active',
            'activated_at' => now(),
            'field_activity_enabled' => $enabled,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function seedCompany(bool $enabled = true): array
    {
        $company = $this->makeCompany('FAC-HARD', $enabled);

        $owner = User::factory()->create(['internal_role' => null, 'is_active' => true]);
        $admin = User::factory()->create(['internal_role' => 'admin', 'is_active' => true]);
        $supervisor = User::factory()->create(['internal_role' => 'supervisor', 'is_active' => true]);
        $otherSupervisor = User::factory()->create(['internal_role' => 'supervisor', 'is_active' => true]);
        $agent = User::factory()->create(['internal_role' => 'agent', 'is_active' => true, 'supervisor_user_id' => $supervisor->id]);
        $otherAgent = User::factory()->create(['internal_role' => 'agent', 'is_active' => true, 'supervisor_user_id' => $otherSupervisor->id]);

        $roles = ['owner' => 'owner', 'admin' => 'admin', 'supervisor' => 'supervisor', 'otherSupervisor' => 'supervisor', 'agent' => 'agent', 'otherAgent' => 'agent'];
        $users = compact('owner', 'admin', 'supervisor', 'otherSupervisor', 'agent', 'otherAgent');
        foreach ($users as $key => $user) {
            DB::table('company_users')->insert([
                'company_id' => $company->id,
                'user_id' => $user->id,
                'role' => $roles[$key],
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        return ['company' => $company, ...$users];
    }
}
