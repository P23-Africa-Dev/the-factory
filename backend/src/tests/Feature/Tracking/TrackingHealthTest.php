<?php

declare(strict_types=1);

namespace Tests\Feature\Tracking;

use App\Models\AgentLocationSnapshot;
use App\Models\Company;
use App\Models\Task;
use App\Models\TaskTrackingSession;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class TrackingHealthTest extends TestCase
{
    use RefreshDatabase;

    public function test_tracking_health_command_reports_metrics_as_json(): void
    {
        config([
            'tracking.abandoned_session_after_seconds' => 3600,
            'tracking.agent_location_stale_after_seconds' => 300,
            'tracking.health_abandoned_alert_threshold' => 50,
        ]);

        [$company, $admin, $agent] = $this->seedCompanyUsers();
        $this->seedOpenSessionAndSnapshot($company, $admin, $agent, stale: true);

        $exitCode = Artisan::call('tracking:health', ['--json' => true]);
        $this->assertSame(0, $exitCode);

        $payload = json_decode(Artisan::output(), true);
        $this->assertIsArray($payload);
        $this->assertSame(1, $payload['open_sessions']);
        $this->assertSame(1, $payload['abandoned_open_sessions']);
        $this->assertSame(1, $payload['agent_location_snapshots']);
        $this->assertSame(1, $payload['stale_snapshots']);
        $this->assertFalse($payload['alert_abandoned']);
    }

    public function test_tracking_health_command_can_fail_on_alert_threshold(): void
    {
        config([
            'tracking.abandoned_session_after_seconds' => 3600,
            'tracking.health_abandoned_alert_threshold' => 1,
        ]);

        [$company, $admin, $agent] = $this->seedCompanyUsers('FAC-HEALTH-ALERT');
        $this->seedOpenSessionAndSnapshot($company, $admin, $agent, stale: true);

        $secondTask = Task::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'assigned_agent_id' => $agent->id,
            'title' => 'Second Abandoned',
            'type' => 'inspection',
            'description' => 'Extra abandoned session.',
            'location_text' => 'Lagos',
            'address_full' => 'Plot 3, Lagos',
            'latitude' => 6.4300,
            'longitude' => 3.4200,
            'due_at' => now()->addDay(),
            'required_actions' => [],
            'priority' => 'medium',
            'minimum_photos_required' => 0,
            'visit_verification_required' => false,
            'status' => 'in_progress',
        ]);

        $staleAt = now()->subHours(5);
        TaskTrackingSession::query()->create([
            'task_id' => $secondTask->id,
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

        $exitCode = Artisan::call('tracking:health', [
            '--json' => true,
            '--fail-on-alert' => true,
        ]);

        $this->assertSame(1, $exitCode);
    }

    public function test_admin_tracking_health_endpoint_returns_metrics(): void
    {
        config([
            'tracking.abandoned_session_after_seconds' => 3600,
            'tracking.agent_location_stale_after_seconds' => 300,
        ]);

        [$company, $admin, $agent] = $this->seedCompanyUsers('FAC-HEALTH-API');
        $this->seedOpenSessionAndSnapshot($company, $admin, $agent, stale: true);

        $response = $this->withToken($admin->createToken('admin-tracking-health')->plainTextToken)
            ->getJson('/api/v1/admin/tracking/health?company_id=' . $company->id);

        $response->assertOk()
            ->assertJsonPath('data.open_sessions', 1)
            ->assertJsonPath('data.abandoned_open_sessions', 1)
            ->assertJsonPath('data.agent_location_snapshots', 1)
            ->assertJsonPath('data.stale_snapshots', 1);
    }

    private function seedCompanyUsers(string $companyCode = 'FAC-HEALTH001'): array
    {
        $company = Company::create([
            'company_id' => $companyCode,
            'name' => 'Tracking Health Ltd',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Tracking health',
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

    private function seedOpenSessionAndSnapshot(Company $company, User $admin, User $agent, bool $stale): void
    {
        $task = Task::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'assigned_agent_id' => $agent->id,
            'title' => 'Health Task',
            'type' => 'inspection',
            'description' => 'Task for health metrics.',
            'location_text' => 'Lagos',
            'address_full' => 'Plot 1, Lagos',
            'latitude' => 6.4300,
            'longitude' => 3.4200,
            'due_at' => now()->addDay(),
            'required_actions' => [],
            'priority' => 'medium',
            'minimum_photos_required' => 0,
            'visit_verification_required' => false,
            'status' => 'in_progress',
        ]);

        $recordedAt = $stale ? now()->subHours(5) : now()->subMinutes(2);

        $session = TaskTrackingSession::query()->create([
            'task_id' => $task->id,
            'company_id' => $company->id,
            'started_by_user_id' => $agent->id,
            'start_latitude' => 6.4000,
            'start_longitude' => 3.3900,
            'start_accuracy_meters' => 5,
            'start_recorded_at' => $recordedAt,
            'last_latitude' => 6.4010,
            'last_longitude' => 3.3910,
            'last_accuracy_meters' => 5,
            'last_recorded_at' => $recordedAt,
            'last_persisted_latitude' => 6.4010,
            'last_persisted_longitude' => 3.3910,
            'last_persisted_recorded_at' => $recordedAt,
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
            'recorded_at' => $recordedAt,
            'last_seen_at' => $recordedAt,
        ]);
    }
}
