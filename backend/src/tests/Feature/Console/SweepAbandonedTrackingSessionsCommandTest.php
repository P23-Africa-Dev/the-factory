<?php

declare(strict_types=1);

namespace Tests\Feature\Console;

use App\Models\Company;
use App\Models\Task;
use App\Models\TaskTrackingSession;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class SweepAbandonedTrackingSessionsCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_sweep_abandoned_closes_stale_open_sessions(): void
    {
        config(['tracking.abandoned_session_after_seconds' => 3600]);

        [$company, $admin, $agent] = $this->seedCompanyUsers();

        $task = $this->createTask($company->id, $admin->id, $agent->id);
        $staleAt = now()->subHours(3);

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
            'last_accuracy_meters' => 6,
            'last_recorded_at' => $staleAt,
            'last_persisted_latitude' => 6.4010,
            'last_persisted_longitude' => 3.3910,
            'last_persisted_recorded_at' => $staleAt,
            'destination_latitude' => 6.4300,
            'destination_longitude' => 3.4200,
            'destination_radius_meters' => 100,
            'end_recorded_at' => null,
        ]);

        $freshTask = $this->createTask($company->id, $admin->id, $agent->id, 'Fresh Task');
        $freshSession = TaskTrackingSession::query()->create([
            'task_id' => $freshTask->id,
            'company_id' => $company->id,
            'started_by_user_id' => $agent->id,
            'start_latitude' => 6.4100,
            'start_longitude' => 3.4000,
            'start_accuracy_meters' => 5,
            'start_recorded_at' => now()->subMinutes(10),
            'last_latitude' => 6.4110,
            'last_longitude' => 3.4010,
            'last_accuracy_meters' => 5,
            'last_recorded_at' => now()->subMinutes(5),
            'last_persisted_latitude' => 6.4110,
            'last_persisted_longitude' => 3.4010,
            'last_persisted_recorded_at' => now()->subMinutes(5),
            'destination_latitude' => 6.4300,
            'destination_longitude' => 3.4200,
            'destination_radius_meters' => 100,
            'end_recorded_at' => null,
        ]);

        Artisan::call('tracking:sweep-abandoned');

        $session->refresh();
        $freshSession->refresh();

        $this->assertNotNull($session->end_recorded_at);
        $this->assertNull($freshSession->end_recorded_at);

        $this->assertDatabaseHas('task_location_points', [
            'tracking_session_id' => $session->id,
            'event_type' => 'auto_closed',
            'is_checkpoint' => true,
        ]);
    }

    private function seedCompanyUsers(): array
    {
        $company = Company::create([
            'company_id' => 'FAC-SWEEP001',
            'name' => 'Tracking Sweep Ltd',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Abandoned session sweep',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $admin = User::factory()->create(['email_verified_at' => now()]);
        $agent = User::factory()->create(['email_verified_at' => now()]);

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

    private function createTask(int $companyId, int $creatorId, int $agentId, string $title = 'Abandoned Task'): Task
    {
        return Task::create([
            'company_id' => $companyId,
            'created_by_user_id' => $creatorId,
            'assigned_agent_id' => $agentId,
            'title' => $title,
            'type' => 'inspection',
            'description' => 'Task for abandoned sweep tests.',
            'location_text' => 'Lagos',
            'address_full' => 'Plot 2, Lagos',
            'latitude' => 6.4300,
            'longitude' => 3.4200,
            'due_at' => now()->addDay(),
            'required_actions' => [],
            'priority' => 'medium',
            'minimum_photos_required' => 0,
            'visit_verification_required' => false,
            'status' => 'in_progress',
        ]);
    }
}
