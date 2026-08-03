<?php

declare(strict_types=1);

namespace Tests\Feature\FieldActivity;

use App\Models\AttendanceRecord;
use App\Models\Company;
use App\Models\FieldActivitySession;
use App\Models\FieldLocationPoint;
use App\Models\FieldStop;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class FieldJourneyApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_management_can_list_and_show_agent_journeys(): void
    {
        [$company, $owner, $agent] = $this->seedCompany();
        $session = $this->seedJourney($company, $agent);

        $this->actingAs($owner, 'sanctum')
            ->getJson("/api/v1/field-activity/agents/{$agent->id}/journeys?company_id={$company->id}&preset=last_30_days")
            ->assertOk()
            ->assertJsonPath('data.agent.id', $agent->id)
            ->assertJsonPath('data.summary.journey_count', 1)
            ->assertJsonPath('data.items.0.id', $session->id);

        $this->actingAs($owner, 'sanctum')
            ->getJson("/api/v1/field-activity/journeys/{$session->id}?company_id={$company->id}")
            ->assertOk()
            ->assertJsonPath('data.journey.id', $session->id)
            ->assertJsonStructure([
                'data' => [
                    'journey',
                    'stats',
                    'stops',
                    'timeline',
                    'route' => ['coordinates', 'point_count'],
                    'navigation',
                    'playback',
                ],
            ]);
    }

    public function test_agent_can_only_view_own_journeys(): void
    {
        [$company, $owner, $agent] = $this->seedCompany();
        $other = User::factory()->create(['internal_role' => 'agent', 'is_active' => true]);
        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $other->id,
            'role' => 'agent',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $ownSession = $this->seedJourney($company, $agent);
        $otherSession = $this->seedJourney($company, $other, '2026-07-28');

        $this->actingAs($agent, 'sanctum')
            ->getJson("/api/v1/agent/field-activity/journeys?company_id={$company->id}&preset=last_90_days")
            ->assertOk()
            ->assertJsonPath('data.summary.journey_count', 1)
            ->assertJsonPath('data.items.0.id', $ownSession->id);

        $this->actingAs($agent, 'sanctum')
            ->getJson("/api/v1/agent/field-activity/journeys/{$ownSession->id}?company_id={$company->id}")
            ->assertOk()
            ->assertJsonPath('data.journey.id', $ownSession->id);

        $this->actingAs($agent, 'sanctum')
            ->getJson("/api/v1/agent/field-activity/journeys/{$otherSession->id}?company_id={$company->id}")
            ->assertStatus(422);
    }

    public function test_agent_cannot_list_another_agents_journeys_via_management_route(): void
    {
        [$company, $owner, $agent] = $this->seedCompany();
        $this->seedJourney($company, $agent);

        $this->actingAs($agent, 'sanctum')
            ->getJson("/api/v1/field-activity/agents/{$agent->id}/journeys?company_id={$company->id}")
            ->assertForbidden();
    }

    /**
     * @return array{0: Company, 1: User, 2: User}
     */
    private function seedCompany(): array
    {
        $company = Company::create([
            'company_id' => 'FAC-JRN-' . strtoupper((string) fake()->lexify('????')),
            'name' => 'Journey Co',
            'country' => 'NG',
            'currency_code' => 'NGN',
            'team_size' => '11-50',
            'use_case' => 'Journey testing',
            'status' => 'active',
            'activated_at' => now(),
            'field_activity_enabled' => true,
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

    private function seedJourney(Company $company, User $agent, string $date = '2026-07-29'): FieldActivitySession
    {
        $record = AttendanceRecord::query()->create([
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'attendance_date' => $date,
            'clock_in_at' => Carbon::parse("{$date} 09:00:00"),
            'clock_out_at' => Carbon::parse("{$date} 17:00:00"),
            'status' => 'present',
            'metadata' => [
                'clock_in_latitude' => 6.5244,
                'clock_in_longitude' => 3.3792,
                'clock_out_latitude' => 6.5300,
                'clock_out_longitude' => 3.3900,
            ],
        ]);

        $session = FieldActivitySession::query()->create([
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'attendance_record_id' => $record->id,
            'status' => 'completed',
            'started_at' => Carbon::parse("{$date} 09:00:00"),
            'ended_at' => Carbon::parse("{$date} 17:00:00"),
            'distance_meters' => 12500,
            'travel_seconds' => 7200,
            'stationary_seconds' => 14400,
            'stop_count' => 1,
            'visit_count' => 1,
            'unknown_stop_count' => 0,
        ]);

        FieldStop::query()->create([
            'field_activity_session_id' => $session->id,
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'arrived_at' => Carbon::parse("{$date} 11:00:00"),
            'departed_at' => Carbon::parse("{$date} 11:45:00"),
            'latitude' => 6.55,
            'longitude' => 3.35,
            'duration_seconds' => 2700,
            'confidence' => 0.9,
            'match_type' => 'unknown',
            'classification' => 'customer_visit',
        ]);

        FieldLocationPoint::query()->create([
            'field_activity_session_id' => $session->id,
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'latitude' => 6.5244,
            'longitude' => 3.3792,
            'recorded_at' => Carbon::parse("{$date} 09:05:00"),
            'speed_mps' => 4.2,
            'movement_state' => 'moving',
        ]);

        FieldLocationPoint::query()->create([
            'field_activity_session_id' => $session->id,
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'latitude' => 6.55,
            'longitude' => 3.35,
            'recorded_at' => Carbon::parse("{$date} 11:00:00"),
            'speed_mps' => 0.1,
            'movement_state' => 'stopped',
        ]);

        return $session;
    }
}
