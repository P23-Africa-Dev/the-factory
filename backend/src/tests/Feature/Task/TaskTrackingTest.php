<?php

declare(strict_types=1);

namespace Tests\Feature\Task;

use App\Models\Company;
use App\Models\Task;
use App\Models\TaskLocationPoint;
use App\Models\TaskTrackingSession;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class TaskTrackingTest extends TestCase
{
    use RefreshDatabase;

    public function test_task_start_requires_location_permission_confirmation(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();

        $task = $this->createAssignedTask($company->id, $admin->id, $agent->id, [
            'status' => 'pending',
            'latitude' => 6.5000,
            'longitude' => 3.3000,
        ]);

        $response = $this->withToken($agent->createToken('agent-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/tasks/' . $task->id . '/start', [
                'company_id' => $company->id,
                'latitude' => 6.4500,
                'longitude' => 3.3500,
                'location_permission_granted' => false,
            ]);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['location_permission_granted']);
    }

    public function test_task_location_cannot_be_recorded_without_active_tracking_session(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();

        $task = $this->createAssignedTask($company->id, $admin->id, $agent->id, [
            'status' => 'in_progress',
        ]);

        $response = $this->withToken($agent->createToken('agent-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/tasks/' . $task->id . '/location', [
                'company_id' => $company->id,
                'latitude' => 6.4500,
                'longitude' => 3.3500,
            ]);

        $response->assertUnprocessable()
            ->assertJsonPath('errors.tracking.0', 'Tracking session is not active for this task.');
    }

    public function test_assign_start_track_arrive_complete_and_route_lifecycle(): void
    {
        Storage::fake('local');

        [$company, $admin, $agent] = $this->seedCompanyUsers();

        $task = $this->createAssignedTask($company->id, $admin->id, $agent->id, [
            'status' => 'pending',
            'minimum_photos_required' => 1,
            'latitude' => 6.4300,
            'longitude' => 3.4200,
        ]);

        $token = $agent->createToken('agent-token', ['*'])->plainTextToken;

        $startResponse = $this->withToken($token)
            ->postJson('/api/v1/tasks/' . $task->id . '/start', [
                'company_id' => $company->id,
                'location_permission_granted' => true,
                'latitude' => 6.4000,
                'longitude' => 3.3900,
                'accuracy_meters' => 5,
            ]);

        $startResponse->assertOk()
            ->assertJsonPath('data.task.status', 'in_progress')
            ->assertJsonPath('data.arrived', false)
            ->assertJsonPath('data.tracking.start.latitude', 6.4);

        $this->assertDatabaseHas('task_tracking_sessions', [
            'task_id' => $task->id,
            'started_by_user_id' => $agent->id,
        ]);

        $locationResponse = $this->withToken($token)
            ->postJson('/api/v1/tasks/' . $task->id . '/location', [
                'company_id' => $company->id,
                'points' => [
                    [
                        'latitude' => 6.4100,
                        'longitude' => 3.4000,
                        'recorded_at' => now()->addMinute()->toISOString(),
                    ],
                    [
                        'latitude' => 6.4301,
                        'longitude' => 3.4201,
                        'recorded_at' => now()->addMinutes(2)->toISOString(),
                    ],
                ],
            ]);

        $locationResponse->assertOk()
            ->assertJsonPath('data.arrived', true)
            ->assertJsonPath('data.received_points', 2);

        $this->assertDatabaseHas('task_tracking_sessions', [
            'task_id' => $task->id,
        ]);

        $this->assertDatabaseHas('task_location_points', [
            'task_id' => $task->id,
            'event_type' => 'arrival',
        ]);

        $routeResponse = $this->withToken($token)
            ->getJson('/api/v1/tasks/' . $task->id . '/route?company_id=' . $company->id);

        $routeResponse->assertOk()
            ->assertJsonPath('data.task_id', $task->id)
            ->assertJsonPath('data.summary.points_count', 3);

        $completeResponse = $this->withToken($token)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v1/tasks/' . $task->id . '/complete', [
                'company_id' => $company->id,
                'latitude' => 6.4302,
                'longitude' => 3.4202,
                'accuracy_meters' => 4,
                'notes' => 'Reached destination and completed work.',
                'files' => [UploadedFile::fake()->image('proof-1.jpg', 800, 800)],
            ]);

        $completeResponse->assertOk()
            ->assertJsonPath('data.task.status', 'completed')
            ->assertJsonPath('data.tracking.end.latitude', 6.4302);

        $this->assertDatabaseHas('task_location_points', [
            'task_id' => $task->id,
            'event_type' => 'complete',
            'is_checkpoint' => true,
        ]);

        $this->assertDatabaseHas('task_tracking_sessions', [
            'task_id' => $task->id,
            'completed_by_user_id' => $agent->id,
        ]);
    }

    public function test_agents_from_other_company_cannot_track_task(): void
    {
        [$companyOne, $adminOne, $agentOne] = $this->seedCompanyUsers('FAC-TRACK001');
        [$companyTwo,, $agentTwo] = $this->seedCompanyUsers('FAC-TRACK002');

        $task = $this->createAssignedTask($companyOne->id, $adminOne->id, $agentOne->id, [
            'status' => 'pending',
        ]);

        $response = $this->withToken($agentTwo->createToken('foreign-agent-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/tasks/' . $task->id . '/start', [
                'company_id' => $companyTwo->id,
                'location_permission_granted' => true,
                'latitude' => 6.4000,
                'longitude' => 3.3900,
            ]);

        $response->assertUnprocessable()
            ->assertJsonPath('errors.task.0', 'Task does not belong to the active company context.');
    }

    public function test_multiple_agents_can_be_tracked_simultaneously_on_separate_tasks(): void
    {
        [$company, $admin, $agentOne] = $this->seedCompanyUsers();

        $agentTwo = User::factory()->create(['email_verified_at' => now()]);
        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $agentTwo->id,
            'role' => 'agent',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $taskOne = $this->createAssignedTask($company->id, $admin->id, $agentOne->id, ['status' => 'pending']);
        $taskTwo = $this->createAssignedTask($company->id, $admin->id, $agentTwo->id, ['status' => 'pending']);

        $this->actingAs($agentOne, 'sanctum')
            ->postJson('/api/v1/tasks/' . $taskOne->id . '/start', [
                'company_id' => $company->id,
                'location_permission_granted' => true,
                'latitude' => 6.4000,
                'longitude' => 3.3900,
            ])->assertOk();

        $this->actingAs($agentTwo, 'sanctum')
            ->postJson('/api/v1/tasks/' . $taskTwo->id . '/start', [
                'company_id' => $company->id,
                'location_permission_granted' => true,
                'latitude' => 6.5000,
                'longitude' => 3.4900,
            ])->assertOk();

        $this->actingAs($agentOne, 'sanctum')
            ->postJson('/api/v1/tasks/' . $taskOne->id . '/location', [
                'company_id' => $company->id,
                'latitude' => 6.4010,
                'longitude' => 3.3910,
            ])->assertOk();

        $this->actingAs($agentTwo, 'sanctum')
            ->postJson('/api/v1/tasks/' . $taskTwo->id . '/location', [
                'company_id' => $company->id,
                'latitude' => 6.5010,
                'longitude' => 3.4910,
            ])->assertOk();

        $this->assertDatabaseCount('task_tracking_sessions', 2);

        $sessionOne = TaskTrackingSession::query()->where('task_id', $taskOne->id)->firstOrFail();
        $sessionTwo = TaskTrackingSession::query()->where('task_id', $taskTwo->id)->firstOrFail();

        $this->assertNotSame($sessionOne->id, $sessionTwo->id);

        $this->assertGreaterThan(0, TaskLocationPoint::query()->where('task_id', $taskOne->id)->count());
        $this->assertGreaterThan(0, TaskLocationPoint::query()->where('task_id', $taskTwo->id)->count());
    }

    private function createAssignedTask(int $companyId, int $creatorId, int $agentId, array $overrides = []): Task
    {
        $task = Task::create(array_merge([
            'company_id' => $companyId,
            'created_by_user_id' => $creatorId,
            'assigned_agent_id' => $agentId,
            'title' => 'Tracking Task',
            'type' => 'inspection',
            'description' => 'Tracking lifecycle task.',
            'location_text' => 'Lagos',
            'address_full' => 'Plot 1, Lagos',
            'latitude' => 6.4300,
            'longitude' => 3.4200,
            'due_at' => now()->addDay(),
            'required_actions' => [],
            'priority' => 'medium',
            'minimum_photos_required' => 0,
            'visit_verification_required' => false,
            'status' => 'pending',
        ], $overrides));

        DB::table('task_assignments')->insert([
            'task_id' => $task->id,
            'assigned_by_user_id' => $creatorId,
            'assigned_agent_id' => $agentId,
            'assigned_at' => now(),
            'is_current' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $task;
    }

    private function seedCompanyUsers(string $companyCode = 'FAC-TRACK001'): array
    {
        $company = Company::create([
            'company_id' => $companyCode,
            'name' => 'Tracking Factory Ltd',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Field tracking',
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
}
