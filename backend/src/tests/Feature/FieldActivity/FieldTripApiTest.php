<?php

declare(strict_types=1);

namespace Tests\Feature\FieldActivity;

use App\Models\Company;
use App\Models\FieldActivitySession;
use App\Models\FieldLocationPoint;
use App\Models\FieldStop;
use App\Models\User;
use App\Services\AI\Providers\AiProviderRouter;
use App\Services\FieldActivity\FieldTripService;
use App\Services\Location\MapboxGeocodingService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Mockery;
use Tests\TestCase;

/**
 * Field Trips: "Start Field Trip" / "End Field Trip" for agents and managers,
 * independent of clock-in, any number per day.
 */
class FieldTripApiTest extends TestCase
{
    use RefreshDatabase;

    private const LAT = 6.5244;
    private const LNG = 3.3792;

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

    public function test_agent_can_take_several_trips_in_one_day_without_clocking_in(): void
    {
        $f = $this->seedCompany();

        $first = $this->startTrip($f['agent'], $f['company'])->assertCreated()
            ->assertJsonPath('data.trip.source', 'field_trip')
            ->assertJsonPath('data.trip.status', 'active')
            ->assertJsonPath('data.trip.attendance_record_id', null)
            ->json('data.trip.id');

        Carbon::setTestNow(Carbon::parse('2026-11-25 11:00:00'));
        $this->endTrip($f['agent'], $f['company'], $first)->assertOk()
            ->assertJsonPath('data.trip.status', 'completed')
            ->assertJsonPath('data.trip.end_reason', 'user');

        Carbon::setTestNow(Carbon::parse('2026-11-25 13:00:00'));
        $second = $this->startTrip($f['agent'], $f['company'])->assertCreated()->json('data.trip.id');
        $this->assertNotSame($first, $second);

        $this->actingAs($f['agent'], 'sanctum')
            ->getJson("/api/v1/field-trips/current?company_id={$f['company']->id}")
            ->assertOk()
            ->assertJsonPath('data.enabled', true)
            ->assertJsonPath('data.trip.id', $second)
            ->assertJsonPath('data.today.trip_count', 2);

        $this->assertDatabaseMissing('attendance_records', ['user_id' => $f['agent']->id]);
    }

    public function test_managers_can_take_field_trips_too(): void
    {
        $f = $this->seedCompany();

        foreach (['owner', 'admin', 'supervisor'] as $role) {
            $this->startTrip($f[$role], $f['company'])->assertCreated()
                ->assertJsonPath('data.trip.user_id', $f[$role]->id);
        }
    }

    public function test_start_is_idempotent_and_only_one_trip_runs_at_a_time(): void
    {
        $f = $this->seedCompany();
        $clientTripId = (string) Str::uuid();

        $id = $this->startTrip($f['agent'], $f['company'], ['client_trip_id' => $clientTripId])
            ->assertCreated()->json('data.trip.id');

        // Offline replay of the same start.
        $this->startTrip($f['agent'], $f['company'], ['client_trip_id' => $clientTripId])
            ->assertOk()->assertJsonPath('data.trip.id', $id)->assertJsonPath('data.created', false);

        // A second start while one is running returns the running trip.
        $this->startTrip($f['agent'], $f['company'])
            ->assertOk()->assertJsonPath('data.trip.id', $id);

        $this->assertSame(1, FieldActivitySession::query()->where('user_id', $f['agent']->id)->count());
    }

    public function test_trips_are_refused_when_field_activity_is_off(): void
    {
        $f = $this->seedCompany(enabled: false);

        $this->startTrip($f['agent'], $f['company'])->assertStatus(422)
            ->assertJsonPath('errors.field_activity.0', 'Field trips are turned off for your organization. Ask an owner or admin to enable Field Activity.');
    }

    public function test_only_the_trip_owner_can_end_it_or_send_points(): void
    {
        $f = $this->seedCompany();
        $id = $this->startTrip($f['agent'], $f['company'])->json('data.trip.id');

        $this->endTrip($f['owner'], $f['company'], $id)->assertStatus(422);
        $this->actingAs($f['owner'], 'sanctum')
            ->postJson("/api/v1/field-trips/{$id}/points", ['company_id' => $f['company']->id, 'points' => [$this->point(1)]])
            ->assertStatus(422);
    }

    public function test_stop_dwell_follows_the_company_setting(): void
    {
        $f = $this->seedCompany();
        $f['company']->forceFill(['field_stop_dwell_seconds' => 900])->save();

        $id = $this->startTrip($f['agent'], $f['company'])->json('data.trip.id');
        Carbon::setTestNow(Carbon::parse('2026-11-25 10:00:00'));

        // 10 minutes in one place: not a stop under a 15-minute rule.
        $this->sendPoints($f['agent'], $f['company'], $id, range(1, 10))->assertOk();
        $this->assertFalse(FieldStop::query()->where('field_activity_session_id', $id)->exists());

        // 16 minutes: now it is.
        $this->sendPoints($f['agent'], $f['company'], $id, range(11, 16))->assertOk();
        $this->assertTrue(FieldStop::query()->where('field_activity_session_id', $id)->exists());
    }

    public function test_replayed_points_are_not_stored_twice(): void
    {
        $f = $this->seedCompany();
        $id = $this->startTrip($f['agent'], $f['company'])->json('data.trip.id');
        Carbon::setTestNow(Carbon::parse('2026-11-25 10:00:00'));

        $points = [$this->point(2, 'aaaaaaaa-0000-4000-8000-000000000001', 0.001), $this->point(4, 'aaaaaaaa-0000-4000-8000-000000000002', 0.002)];
        $payload = ['company_id' => $f['company']->id, 'points' => $points];

        $this->actingAs($f['agent'], 'sanctum')->postJson("/api/v1/field-trips/{$id}/points", $payload)->assertOk();
        $this->actingAs($f['agent'], 'sanctum')->postJson("/api/v1/field-trips/{$id}/points", $payload)->assertOk();

        // Seed point + two unique points.
        $this->assertSame(3, FieldLocationPoint::query()->where('field_activity_session_id', $id)->count());
    }

    public function test_monitor_reminds_flags_lost_signal_and_auto_ends_without_location(): void
    {
        $f = $this->seedCompany();
        $id = $this->startTrip($f['agent'], $f['company'])->json('data.trip.id');
        $monitor = app(FieldTripService::class);

        // 20 minutes of silence: one "we lost your location" push.
        Carbon::setTestNow(Carbon::parse('2026-11-25 09:20:00'));
        $this->assertSame(1, $monitor->monitor()['signal_lost']);
        $this->assertSame(0, $monitor->monitor()['signal_lost'], 'Signal-lost is sent once per silence.');

        // 2 hours of silence: auto-ended at the last known position time.
        Carbon::setTestNow(Carbon::parse('2026-11-25 11:05:00'));
        $this->assertSame(1, $monitor->monitor()['auto_ended']);

        $trip = FieldActivitySession::query()->findOrFail($id);
        $this->assertSame('auto_closed', $trip->status->value);
        $this->assertSame('auto_no_signal', $trip->end_reason);
        $this->assertTrue($trip->ended_at->equalTo(Carbon::parse('2026-11-25 09:00:00')));
        $this->assertDatabaseHas('app_notifications', ['user_id' => $f['agent']->id, 'type' => 'field_trip.auto_ended']);
    }

    public function test_monitor_sends_a_long_trip_reminder_after_five_hours(): void
    {
        $f = $this->seedCompany();
        $id = $this->startTrip($f['agent'], $f['company'])->json('data.trip.id');
        $monitor = app(FieldTripService::class);

        // Keep sending positions every 30 minutes for 5 h (no signal loss).
        for ($m = 30; $m <= 300; $m += 30) {
            Carbon::setTestNow(Carbon::parse('2026-11-25 09:00:00')->addMinutes($m));
            $this->sendPoints($f['agent'], $f['company'], $id, [$m], moving: true)->assertOk();
        }

        $this->assertSame(1, $monitor->monitor()['reminded']);
        $this->assertSame(0, $monitor->monitor()['reminded'], 'The reminder repeats only after another interval.');
        $this->assertDatabaseHas('app_notifications', ['user_id' => $f['agent']->id, 'type' => 'field_trip.reminder']);
        $this->assertSame('active', FieldActivitySession::query()->findOrFail($id)->status->value);
    }

    public function test_trips_show_in_journey_history_with_source_and_visibility_rules(): void
    {
        $f = $this->seedCompany();
        $agentTrip = $this->startTrip($f['agent'], $f['company'])->json('data.trip.id');
        $supervisorTrip = $this->startTrip($f['supervisor'], $f['company'])->json('data.trip.id');
        $otherTrip = $this->startTrip($f['otherAgent'], $f['company'])->json('data.trip.id');
        Carbon::setTestNow(Carbon::parse('2026-11-25 10:00:00'));
        $this->endTrip($f['agent'], $f['company'], $agentTrip)->assertOk();

        $company = $f['company']->id;

        // Agent: own trips only.
        $this->actingAs($f['agent'], 'sanctum')
            ->getJson("/api/v1/agent/field-activity/journeys?company_id={$company}&preset=today")
            ->assertOk()
            ->assertJsonPath('data.items.0.id', $agentTrip)
            ->assertJsonPath('data.items.0.source', 'field_trip')
            ->assertJsonPath('data.items.0.end_reason', 'user');

        // Supervisor: their own trips and their agents', not other agents'.
        $this->actingAs($f['supervisor'], 'sanctum')
            ->getJson("/api/v1/field-activity/agents/{$f['supervisor']->id}/journeys?company_id={$company}&preset=today")
            ->assertOk()->assertJsonPath('data.items.0.id', $supervisorTrip);
        $this->actingAs($f['supervisor'], 'sanctum')
            ->getJson("/api/v1/field-activity/agents/{$f['agent']->id}/journeys?company_id={$company}&preset=today")
            ->assertOk()->assertJsonPath('data.items.0.id', $agentTrip);
        $this->actingAs($f['supervisor'], 'sanctum')
            ->getJson("/api/v1/field-activity/agents/{$f['otherAgent']->id}/journeys?company_id={$company}&preset=today")
            ->assertStatus(422);

        // Owner: everyone, including managers.
        $this->actingAs($f['owner'], 'sanctum')
            ->getJson("/api/v1/field-activity/journeys/{$otherTrip}?company_id={$company}")
            ->assertOk()
            ->assertJsonPath('data.journey.source', 'field_trip')
            ->assertJsonPath('data.timeline.0.label', 'Field Trip Started');
    }

    // ── helpers ──────────────────────────────────────────────────────────

    /**
     * @param  array<string, mixed>  $extra
     */
    public function test_phone_reports_tracking_health_and_managers_see_it_on_the_journey(): void
    {
        $f = $this->seedCompany();
        $tripId = $this->startTrip($f['agent'], $f['company'])->assertCreated()->json('data.trip.id');

        $this->actingAs($f['agent'], 'sanctum')
            ->postJson("/api/v1/field-trips/{$tripId}/health", [
                'company_id' => $f['company']->id,
                'source' => 'native',
                'app_version' => '1.0.4',
                'app_state' => 'background',
                'permission' => 'always',
                'precise' => true,
                'fixes' => 42,
                'queued' => 3,
                'uploaded' => 39,
                'last_error' => 'timeout',
            ])
            ->assertOk()
            ->assertJsonPath('data.health.source', 'native')
            ->assertJsonPath('data.health.queued', 3);

        $health = FieldActivitySession::find($tripId)->meta['health'];
        $this->assertSame(42, $health['fixes']);
        $this->assertArrayHasKey('received_at', $health);

        // Someone else cannot write health onto this trip.
        $this->actingAs($f['otherAgent'], 'sanctum')
            ->postJson("/api/v1/field-trips/{$tripId}/health", ['company_id' => $f['company']->id, 'fixes' => 1])
            ->assertStatus(422);

        $this->actingAs($f['owner'], 'sanctum')
            ->getJson("/api/v1/admin/field-activity/journeys/{$tripId}?company_id={$f['company']->id}")
            ->assertOk()
            ->assertJsonPath('data.journey.tracking_health.app_state', 'background');
    }

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
     * @param  list<int>  $minutes  minutes after 09:00
     */
    private function sendPoints(User $user, Company $company, int $tripId, array $minutes, bool $moving = false): \Illuminate\Testing\TestResponse
    {
        $points = array_map(fn (int $m): array => $this->point($m, null, $moving ? $m * 0.002 : 0.0), $minutes);

        return $this->actingAs($user, 'sanctum')->postJson("/api/v1/field-trips/{$tripId}/points", [
            'company_id' => $company->id,
            'points' => $points,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function point(int $minutesAfterNine, ?string $clientId = null, float $offset = 0.0): array
    {
        return array_filter([
            'latitude' => self::LAT + $offset,
            'longitude' => self::LNG,
            'speed_mps' => $offset > 0 ? 6 : 0.05,
            'recorded_at' => Carbon::parse('2026-11-25 09:00:00')->addMinutes($minutesAfterNine)->toIso8601String(),
            'client_point_id' => $clientId,
        ], static fn ($v): bool => $v !== null);
    }

    /**
     * @return array<string, mixed>
     */
    private function seedCompany(bool $enabled = true): array
    {
        $company = Company::create([
            'company_id' => 'FAC-TRIP-'.strtoupper((string) fake()->lexify('????')),
            'name' => 'Field Trip Co',
            'country' => 'NG',
            'currency_code' => 'NGN',
            'team_size' => '11-50',
            'use_case' => 'Field trip testing',
            'status' => 'active',
            'activated_at' => now(),
            'field_activity_enabled' => $enabled,
        ]);

        $owner = User::factory()->create(['internal_role' => null, 'is_active' => true]);
        $admin = User::factory()->create(['internal_role' => 'admin', 'is_active' => true]);
        $supervisor = User::factory()->create(['internal_role' => 'supervisor', 'is_active' => true]);
        $agent = User::factory()->create(['internal_role' => 'agent', 'is_active' => true, 'supervisor_user_id' => $supervisor->id]);
        $otherAgent = User::factory()->create(['internal_role' => 'agent', 'is_active' => true]);

        foreach (['owner' => $owner, 'admin' => $admin, 'supervisor' => $supervisor, 'agent' => $agent, 'otherAgent' => $otherAgent] as $key => $user) {
            DB::table('company_users')->insert([
                'company_id' => $company->id,
                'user_id' => $user->id,
                'role' => $key === 'otherAgent' ? 'agent' : $key,
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        return compact('company', 'owner', 'admin', 'supervisor', 'agent', 'otherAgent');
    }
}
