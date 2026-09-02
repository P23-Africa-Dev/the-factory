<?php

declare(strict_types=1);

namespace Tests\Feature\Workforce;

use App\Models\AgentLocationSnapshot;
use App\Models\Company;
use App\Models\Task;
use App\Models\TaskTrackingSession;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AgentPresenceTest extends TestCase
{
    use RefreshDatabase;

    public function test_internal_users_paginated_response_includes_presence(): void
    {
        [$company, $admin, $agent] = $this->seedInternalUsers();

        $response = $this->withToken($admin->createToken('admin-presence-list')->plainTextToken)
            ->getJson('/api/v1/internal-users?company_id=' . $company->id . '&role=agent&per_page=10');

        $response->assertOk()
            ->assertJsonPath('data.items.0.id', $agent->id)
            ->assertJsonPath('data.items.0.presence.is_session_online', false)
            ->assertJsonPath('data.items.0.presence.is_map_active', false);
    }

    public function test_recent_token_use_marks_session_online(): void
    {
        [$company, $admin, $agent] = $this->seedInternalUsers();

        $agent->createToken('agent-session-token', ['*']);
        DB::table('personal_access_tokens')
            ->where('tokenable_id', $agent->id)
            ->where('name', 'agent-session-token')
            ->update(['last_used_at' => now()]);

        $response = $this->withToken($admin->createToken('admin-session-presence')->plainTextToken)
            ->getJson('/api/v1/internal-users?company_id=' . $company->id . '&role=agent&per_page=10');

        $response->assertOk()
            ->assertJsonPath('data.items.0.presence.is_session_online', true)
            ->assertJsonPath('data.items.0.presence.is_map_active', false);
    }

    public function test_stale_token_marks_session_offline(): void
    {
        [$company, $admin, $agent] = $this->seedInternalUsers();

        $agent->createToken('stale-session-token', ['*']);
        DB::table('personal_access_tokens')
            ->where('tokenable_id', $agent->id)
            ->where('name', 'stale-session-token')
            ->update(['last_used_at' => now()->subHours(2)]);

        $response = $this->withToken($admin->createToken('admin-stale-session')->plainTextToken)
            ->getJson('/api/v1/internal-users?company_id=' . $company->id . '&role=agent&per_page=10');

        $response->assertOk()
            ->assertJsonPath('data.items.0.presence.is_session_online', false);
    }

    public function test_fresh_snapshot_marks_map_active(): void
    {
        [$company, $admin, $agent] = $this->seedInternalUsers();

        AgentLocationSnapshot::query()->create([
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'task_id' => null,
            'tracking_session_id' => null,
            'latitude' => 6.5244,
            'longitude' => 3.3792,
            'event_type' => 'map_presence',
            'task_status' => null,
            'arrived' => false,
            'recorded_at' => now(),
            'last_seen_at' => now(),
        ]);

        $response = $this->withToken($admin->createToken('admin-map-active')->plainTextToken)
            ->getJson('/api/v1/internal-users?company_id=' . $company->id . '&role=agent&per_page=10');

        $response->assertOk()
            ->assertJsonPath('data.items.0.presence.is_map_active', true)
            ->assertJsonPath('data.items.0.presence.latitude', 6.5244);
    }

    public function test_stale_snapshot_marks_map_inactive(): void
    {
        [$company, $admin, $agent] = $this->seedInternalUsers();

        AgentLocationSnapshot::query()->create([
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'task_id' => null,
            'tracking_session_id' => null,
            'latitude' => 6.5244,
            'longitude' => 3.3792,
            'event_type' => 'map_presence',
            'task_status' => null,
            'arrived' => false,
            'recorded_at' => now()->subMinutes(30),
            'last_seen_at' => now()->subMinutes(30),
        ]);

        $response = $this->withToken($admin->createToken('admin-map-stale')->plainTextToken)
            ->getJson('/api/v1/internal-users?company_id=' . $company->id . '&role=agent&per_page=10');

        $response->assertOk()
            ->assertJsonPath('data.items.0.presence.is_map_active', false);
    }

    public function test_heartbeat_endpoint_upserts_snapshot_without_task(): void
    {
        [$company, , $agent] = $this->seedInternalUsers();

        $response = $this->withToken($agent->createToken('agent-heartbeat')->plainTextToken)
            ->postJson('/api/v1/agent/presence/heartbeat', [
                'company_id' => $company->id,
                'latitude' => 6.4550,
                'longitude' => 3.3941,
                'accuracy_meters' => 8,
            ]);

        $response->assertOk()
            ->assertJsonPath('data.last_seen_at', fn ($value) => $value !== null);

        $this->assertDatabaseHas('agent_location_snapshots', [
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'task_id' => null,
            'event_type' => 'map_presence',
        ]);
    }

    public function test_heartbeat_still_works_when_open_but_stale_tracking_session_exists(): void
    {
        config(['tracking.agent_location_stale_after_seconds' => 300]);

        [$company, $admin, $agent] = $this->seedInternalUsers('FAC-PRESENCE-STALE');

        $task = Task::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'assigned_agent_id' => $agent->id,
            'title' => 'Stale Presence Task',
            'type' => 'inspection',
            'description' => 'Open session should not block stale heartbeat.',
            'location_text' => 'Lagos',
            'address_full' => 'Plot 9, Lagos',
            'latitude' => 6.4300,
            'longitude' => 3.4200,
            'due_at' => now()->addDay(),
            'required_actions' => [],
            'priority' => 'medium',
            'minimum_photos_required' => 0,
            'visit_verification_required' => false,
            'status' => 'in_progress',
        ]);

        $staleAt = now()->subMinutes(30);

        $session = TaskTrackingSession::query()->create([
            'task_id' => $task->id,
            'company_id' => $company->id,
            'started_by_user_id' => $agent->id,
            'start_latitude' => 6.4000,
            'start_longitude' => 3.3900,
            'start_accuracy_meters' => 5,
            'start_recorded_at' => $staleAt,
            'last_latitude' => 6.4010,
            'last_longitude' => 3.3910,
            'last_accuracy_meters' => 5,
            'last_recorded_at' => $staleAt,
            'last_persisted_latitude' => 6.4010,
            'last_persisted_longitude' => 3.3910,
            'last_persisted_recorded_at' => $staleAt,
            'destination_latitude' => 6.4300,
            'destination_longitude' => 3.4200,
            'destination_radius_meters' => 100,
            'end_recorded_at' => null,
        ]);

        AgentLocationSnapshot::query()->create([
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'task_id' => $task->id,
            'tracking_session_id' => $session->id,
            'latitude' => 6.4010,
            'longitude' => 3.3910,
            'event_type' => 'movement',
            'task_status' => 'in_progress',
            'arrived' => false,
            'recorded_at' => $staleAt,
            'last_seen_at' => $staleAt,
        ]);

        $response = $this->withToken($agent->createToken('agent-stale-heartbeat')->plainTextToken)
            ->postJson('/api/v1/agent/presence/heartbeat', [
                'company_id' => $company->id,
                'latitude' => 6.4550,
                'longitude' => 3.3941,
                'accuracy_meters' => 8,
            ]);

        $response->assertOk()
            ->assertJsonPath('data.last_seen_at', fn ($value) => $value !== null);

        $this->assertDatabaseHas('agent_location_snapshots', [
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'task_id' => null,
            'tracking_session_id' => null,
            'event_type' => 'map_presence',
        ]);

        // Open tracking session remains; heartbeat only refreshes presence.
        $this->assertDatabaseHas('task_tracking_sessions', [
            'id' => $session->id,
            'end_recorded_at' => null,
        ]);
    }

    public function test_status_active_filter_matches_live_presence(): void
    {
        [$company, $admin, $agent] = $this->seedInternalUsers();

        $offlineAgent = User::factory()->create([
            'email_verified_at' => now(),
            'internal_role' => 'agent',
            'onboarding_status' => 'active',
            'is_active' => true,
        ]);
        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $offlineAgent->id,
            'role' => 'agent',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('personal_access_tokens')->insert([
            'tokenable_type' => User::class,
            'tokenable_id' => $agent->id,
            'name' => 'live-agent-token',
            'token' => hash('sha256', 'live-agent-token'),
            'abilities' => '["*"]',
            'last_used_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->withToken($admin->createToken('admin-active-filter')->plainTextToken)
            ->getJson('/api/v1/internal-users?company_id=' . $company->id . '&role=agent&status=active&per_page=10');

        $response->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.id', $agent->id);
    }

    /**
     * @return array{0: Company, 1: User, 2: User}
     */
    private function seedInternalUsers(string $companyCode = 'FAC-PRESENCE'): array
    {
        $company = Company::query()->create([
            'company_id' => $companyCode,
            'name' => 'Presence Test Co',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Agent presence',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $admin = User::factory()->create([
            'email_verified_at' => now(),
            'internal_role' => 'admin',
            'onboarding_status' => 'active',
            'is_active' => true,
        ]);

        $agent = User::factory()->create([
            'email_verified_at' => now(),
            'internal_role' => 'agent',
            'onboarding_status' => 'active',
            'is_active' => true,
        ]);

        DB::table('company_users')->insert([
            [
                'company_id' => $company->id,
                'user_id' => $admin->id,
                'role' => 'admin',
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

        return [$company, $admin, $agent];
    }
}
