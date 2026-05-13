<?php

declare(strict_types=1);

namespace Tests\Feature\Console;

use App\Models\Company;
use App\Models\Task;
use App\Models\TaskLocationPoint;
use App\Models\TaskTrackingSession;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PruneTaskTrackingDataCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_tracking_prune_deletes_old_closed_sessions_and_old_non_checkpoint_points(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();

        $oldTimestamp = now()->subDays(120);
        $recentTimestamp = now()->subDays(3);

        $taskClosed = $this->createTask($company->id, $admin->id, $agent->id, 'completed');
        $taskActive = $this->createTask($company->id, $admin->id, $agent->id, 'in_progress');

        $closedSession = $this->createSession($taskClosed, $company->id, $agent->id, [
            'start_recorded_at' => $oldTimestamp,
            'last_recorded_at' => $oldTimestamp,
            'last_persisted_recorded_at' => $oldTimestamp,
            'end_recorded_at' => $oldTimestamp,
        ]);

        $activeSession = $this->createSession($taskActive, $company->id, $agent->id, [
            'start_recorded_at' => $recentTimestamp,
            'last_recorded_at' => $recentTimestamp,
            'last_persisted_recorded_at' => $recentTimestamp,
            'end_recorded_at' => null,
        ]);

        $closedPointId = $this->createPoint($closedSession, $taskClosed, $company->id, $agent->id, [
            'recorded_at' => $oldTimestamp,
            'event_type' => 'movement',
            'is_checkpoint' => false,
        ])->id;

        $activeOldMovementPointId = $this->createPoint($activeSession, $taskActive, $company->id, $agent->id, [
            'recorded_at' => $oldTimestamp,
            'event_type' => 'movement',
            'is_checkpoint' => false,
        ])->id;

        $activeOldCheckpointPointId = $this->createPoint($activeSession, $taskActive, $company->id, $agent->id, [
            'recorded_at' => $oldTimestamp,
            'event_type' => 'arrival',
            'is_checkpoint' => true,
        ])->id;

        Artisan::call('tracking:prune', ['--days' => 90]);

        $this->assertDatabaseMissing('task_tracking_sessions', ['id' => $closedSession->id]);
        $this->assertDatabaseMissing('task_location_points', ['id' => $closedPointId]);

        $this->assertDatabaseHas('task_tracking_sessions', ['id' => $activeSession->id]);
        $this->assertDatabaseMissing('task_location_points', ['id' => $activeOldMovementPointId]);
        $this->assertDatabaseHas('task_location_points', ['id' => $activeOldCheckpointPointId]);
    }

    private function seedCompanyUsers(): array
    {
        $company = Company::create([
            'company_id' => 'FAC-PRUNE001',
            'name' => 'Tracking Retention Ltd',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Tracking lifecycle retention tests',
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

    private function createTask(int $companyId, int $creatorId, int $agentId, string $status): Task
    {
        return Task::create([
            'company_id' => $companyId,
            'created_by_user_id' => $creatorId,
            'assigned_agent_id' => $agentId,
            'title' => 'Retention Task',
            'type' => 'inspection',
            'description' => 'Task for retention lifecycle tests.',
            'location_text' => 'Lagos',
            'address_full' => 'Plot 2, Lagos',
            'latitude' => 6.4300,
            'longitude' => 3.4200,
            'due_at' => now()->addDay(),
            'required_actions' => [],
            'priority' => 'medium',
            'minimum_photos_required' => 0,
            'visit_verification_required' => false,
            'status' => $status,
        ]);
    }

    private function createSession(Task $task, int $companyId, int $userId, array $overrides = []): TaskTrackingSession
    {
        return TaskTrackingSession::create(array_merge([
            'task_id' => $task->id,
            'company_id' => $companyId,
            'started_by_user_id' => $userId,
            'completed_by_user_id' => null,
            'start_latitude' => 6.4300,
            'start_longitude' => 3.4200,
            'start_accuracy_meters' => 5,
            'start_recorded_at' => now()->subDay(),
            'last_latitude' => 6.4301,
            'last_longitude' => 3.4201,
            'last_accuracy_meters' => 6,
            'last_recorded_at' => now()->subDay(),
            'last_persisted_latitude' => 6.4301,
            'last_persisted_longitude' => 3.4201,
            'last_persisted_recorded_at' => now()->subDay(),
            'destination_latitude' => 6.4310,
            'destination_longitude' => 3.4210,
            'destination_radius_meters' => 75,
            'arrival_detected_at' => null,
            'arrival_latitude' => null,
            'arrival_longitude' => null,
            'end_latitude' => null,
            'end_longitude' => null,
            'end_accuracy_meters' => null,
            'end_recorded_at' => null,
        ], $overrides));
    }

    private function createPoint(
        TaskTrackingSession $session,
        Task $task,
        int $companyId,
        int $userId,
        array $overrides = []
    ): TaskLocationPoint {
        return TaskLocationPoint::create(array_merge([
            'tracking_session_id' => $session->id,
            'task_id' => $task->id,
            'company_id' => $companyId,
            'user_id' => $userId,
            'latitude' => 6.4300,
            'longitude' => 3.4200,
            'accuracy_meters' => 4,
            'speed_mps' => null,
            'heading_degrees' => null,
            'event_type' => 'movement',
            'is_checkpoint' => false,
            'recorded_at' => now()->subDay(),
        ], $overrides));
    }
}
