<?php

declare(strict_types=1);

namespace Tests\Feature\FieldActivity;

use App\Models\AttendanceRecord;
use App\Models\AttendanceSetting;
use App\Models\Company;
use App\Models\CompanyLocation;
use App\Models\FieldActivitySession;
use App\Models\FieldStop;
use App\Models\Lead;
use App\Models\User;
use App\Services\Location\MapboxGeocodingService;
use App\Services\AI\Providers\AiProviderRouter;
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

        Config::set('field_activity.stop_dwell_seconds', 900);
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

    public function test_batch_points_create_stop_after_fifteen_minute_dwell(): void
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
        for ($i = 0; $i <= 16; $i++) {
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
            ->assertJsonPath('data.persisted_count', 17);

        $this->assertTrue(
            FieldStop::query()->where('field_activity_session_id', $session->id)->exists(),
            'Expected a confirmed stop after 15+ minutes of stationary points.',
        );
    }

    public function test_brief_stop_under_fifteen_minutes_does_not_create_stop(): void
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
        for ($i = 0; $i <= 5; $i++) {
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
