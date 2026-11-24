<?php

declare(strict_types=1);

namespace Tests\Feature\Task;

use App\Models\Company;
use App\Models\Task;
use App\Models\TaskTrackingSession;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Managers (owner, admin, supervisor) can drag a task to any board column,
 * including reopening completed or cancelled tasks. Agents may also move
 * freely between active statuses; cancelled stays locked for agents.
 */
class TaskManagerStatusTransitionTest extends TestCase
{
    use RefreshDatabase;

    private const STATUSES = ['pending', 'in_progress', 'paused', 'resumed', 'completed', 'cancelled'];

    public function test_managers_can_move_tasks_between_any_two_statuses(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();
        $owner = $this->addMember($company, 'owner');
        $supervisor = $this->addMember($company, 'supervisor');

        // Full matrix for one manager role; every role reuses one task and walks
        // a cycle that includes the previously blocked moves.
        $moves = [];
        foreach (self::STATUSES as $from) {
            foreach (self::STATUSES as $to) {
                if ($from !== $to) {
                    $moves[] = [$admin, 'admin', $from, $to];
                }
            }
        }
        foreach (['owner' => $owner, 'supervisor' => $supervisor] as $role => $manager) {
            foreach ([['pending', 'completed'], ['completed', 'cancelled'], ['cancelled', 'in_progress'], ['in_progress', 'pending']] as [$from, $to]) {
                $moves[] = [$manager, $role, $from, $to];
            }
        }

        $task = $this->createTask($company, $admin, $agent, ['status' => 'pending']);

        foreach ($moves as [$manager, $role, $from, $to]) {
            $task->forceFill(['status' => $from])->saveQuietly();

            $this->actingAs($manager, 'sanctum')
                ->patchJson('/api/v1/admin/tasks/' . $task->id . '/status', [
                    'company_id' => $company->id,
                    'status' => $to,
                ])
                ->assertOk()
                ->assertJsonPath('data.task.status', $to);

            $this->assertSame($to, $task->fresh()->status?->value, "{$role}: {$from} -> {$to}");
        }
    }

    public function test_manager_can_reopen_cancelled_task_to_in_progress(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();
        $task = $this->createTask($company, $admin, $agent, ['status' => 'cancelled']);

        $this->actingAs($admin, 'sanctum')
            ->patchJson('/api/v1/admin/tasks/' . $task->id . '/status', [
                'company_id' => $company->id,
                'status' => 'in_progress',
            ])
            ->assertOk()
            ->assertJsonPath('data.task.status', 'in_progress')
            ->assertJsonPath('data.task.completed_at', null);

        $task->refresh();
        $this->assertSame('in_progress', $task->status?->value);
        $this->assertNotNull($task->started_at);
        $this->assertNull($task->completed_at);
    }

    public function test_manager_can_move_completed_task_to_pending_and_timestamps_are_cleared(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();
        $task = $this->createTask($company, $admin, $agent, [
            'status' => 'completed',
            'started_at' => now()->subHours(2),
            'paused_at' => now()->subHour(),
            'resumed_at' => now()->subMinutes(30),
            'completed_at' => now()->subMinutes(5),
        ]);

        $this->actingAs($admin, 'sanctum')
            ->patchJson('/api/v1/admin/tasks/' . $task->id . '/status', [
                'company_id' => $company->id,
                'status' => 'pending',
            ])
            ->assertOk()
            ->assertJsonPath('data.task.status', 'pending');

        $this->assertDatabaseHas('tasks', [
            'id' => $task->id,
            'status' => 'pending',
            'started_at' => null,
            'paused_at' => null,
            'resumed_at' => null,
            'completed_at' => null,
        ]);
    }

    public function test_manager_can_cancel_completed_task_and_complete_pending_task(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();
        $completed = $this->createTask($company, $admin, $agent, [
            'status' => 'completed',
            'completed_at' => now()->subMinutes(5),
        ]);
        $pending = $this->createTask($company, $admin, $agent, ['status' => 'pending']);

        $this->actingAs($admin, 'sanctum')
            ->patchJson('/api/v1/admin/tasks/' . $completed->id . '/status', [
                'company_id' => $company->id,
                'status' => 'cancelled',
            ])
            ->assertOk();
        $this->assertNull($completed->fresh()->completed_at);

        $this->actingAs($admin, 'sanctum')
            ->patchJson('/api/v1/admin/tasks/' . $pending->id . '/status', [
                'company_id' => $company->id,
                'status' => 'completed',
            ])
            ->assertOk();
        $this->assertNotNull($pending->fresh()->completed_at);
    }

    public function test_manager_completing_task_closes_open_tracking_session(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();
        $task = $this->createTask($company, $admin, $agent, ['status' => 'pending']);

        $this->actingAs($agent, 'sanctum')
            ->postJson('/api/v1/tasks/' . $task->id . '/start', [
                'company_id' => $company->id,
                'location_permission_granted' => true,
                'latitude' => 6.4000,
                'longitude' => 3.3900,
                'accuracy_meters' => 5,
            ])
            ->assertOk();

        $this->assertTrue(
            TaskTrackingSession::query()->where('task_id', $task->id)->whereNull('end_recorded_at')->exists()
        );

        $this->actingAs($admin, 'sanctum')
            ->patchJson('/api/v1/admin/tasks/' . $task->id . '/status', [
                'company_id' => $company->id,
                'status' => 'completed',
            ])
            ->assertOk()
            ->assertJsonPath('data.task.status', 'completed');

        $this->assertFalse(
            TaskTrackingSession::query()->where('task_id', $task->id)->whereNull('end_recorded_at')->exists()
        );
        $this->assertDatabaseHas('task_tracking_sessions', [
            'task_id' => $task->id,
            'completed_by_user_id' => $admin->id,
        ]);
    }

    public function test_manager_cancelling_task_closes_open_tracking_session(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();
        $task = $this->createTask($company, $admin, $agent, ['status' => 'pending']);

        $this->actingAs($agent, 'sanctum')
            ->postJson('/api/v1/tasks/' . $task->id . '/start', [
                'company_id' => $company->id,
                'location_permission_granted' => true,
                'latitude' => 6.4000,
                'longitude' => 3.3900,
                'accuracy_meters' => 5,
            ])
            ->assertOk();

        $this->actingAs($admin, 'sanctum')
            ->patchJson('/api/v1/admin/tasks/' . $task->id . '/status', [
                'company_id' => $company->id,
                'status' => 'cancelled',
            ])
            ->assertOk();

        $this->assertFalse(
            TaskTrackingSession::query()->where('task_id', $task->id)->whereNull('end_recorded_at')->exists()
        );
    }

    public function test_agent_can_freely_move_active_task_statuses(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();

        // Agents may jump pending -> completed when visit verification is not required.
        $pending = $this->createTask($company, $admin, $agent, [
            'status' => 'pending',
            'visit_verification_required' => false,
        ]);
        $this->actingAs($agent, 'sanctum')
            ->patchJson('/api/v1/tasks/' . $pending->id . '/status', [
                'company_id' => $company->id,
                'status' => 'completed',
            ])
            ->assertOk()
            ->assertJsonPath('data.task.status', 'completed');

        // Agents may move a completed task to cancelled.
        $completed = $this->createTask($company, $admin, $agent, ['status' => 'completed']);
        $this->actingAs($agent, 'sanctum')
            ->patchJson('/api/v1/tasks/' . $completed->id . '/status', [
                'company_id' => $company->id,
                'status' => 'cancelled',
            ])
            ->assertOk()
            ->assertJsonPath('data.task.status', 'cancelled');

        // Agents still cannot reopen a cancelled task.
        $cancelled = $this->createTask($company, $admin, $agent, ['status' => 'cancelled']);
        $this->actingAs($agent, 'sanctum')
            ->patchJson('/api/v1/tasks/' . $cancelled->id . '/status', [
                'company_id' => $company->id,
                'status' => 'in_progress',
            ])
            ->assertUnprocessable()
            ->assertJsonPath(
                'errors.status.0',
                'Cancelled tasks cannot be reopened by agents. Ask a manager to reopen this task.'
            );

        // Agents still cannot use the manager endpoint.
        $this->actingAs($agent, 'sanctum')
            ->patchJson('/api/v1/admin/tasks/' . $cancelled->id . '/status', [
                'company_id' => $company->id,
                'status' => 'in_progress',
            ])
            ->assertForbidden();
        $this->assertSame('cancelled', $cancelled->fresh()->status?->value);
    }

    public function test_manager_completing_with_flag_marks_incomplete_subtasks_done(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();
        $task = $this->createTask($company, $admin, $agent, ['status' => 'in_progress']);

        $open = \App\Models\TaskSubtask::create([
            'company_id' => $company->id,
            'task_id' => $task->id,
            'created_by_user_id' => $admin->id,
            'assigned_user_id' => $agent->id,
            'title' => 'Call client',
            'position' => 0,
            'is_completed' => false,
        ]);
        $done = \App\Models\TaskSubtask::create([
            'company_id' => $company->id,
            'task_id' => $task->id,
            'created_by_user_id' => $admin->id,
            'assigned_user_id' => $agent->id,
            'title' => 'Already done',
            'position' => 1,
            'is_completed' => true,
            'completed_at' => now()->subHour(),
            'completed_by_user_id' => $agent->id,
        ]);

        $this->actingAs($admin, 'sanctum')
            ->patchJson('/api/v1/admin/tasks/' . $task->id . '/status', [
                'company_id' => $company->id,
                'status' => 'completed',
                'complete_incomplete_subtasks' => true,
            ])
            ->assertOk()
            ->assertJsonPath('data.task.status', 'completed');

        $this->assertTrue($open->fresh()->is_completed);
        $this->assertNotNull($open->fresh()->completed_at);
        $this->assertSame($admin->id, (int) $open->fresh()->completed_by_user_id);
        $this->assertTrue($done->fresh()->is_completed);
        $this->assertSame('completed', $task->fresh()->status?->value);
    }

    public function test_supervisor_can_self_assign_but_not_assign_unsupervised_agent(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();
        $supervisor = $this->addMember($company, 'supervisor');

        $this->actingAs($supervisor, 'sanctum')
            ->postJson('/api/v1/tasks', [
                'company_id' => $company->id,
                'title' => 'Supervisor Self Task',
                'description' => 'A supervisor assigns this task to themselves.',
                'assigned_agent_id' => $supervisor->id,
            ])
            ->assertCreated()
            ->assertJsonPath('data.task.assigned_agent_id', $supervisor->id);

        // The agent is not under this supervisor, so it is still rejected.
        $this->actingAs($supervisor, 'sanctum')
            ->postJson('/api/v1/tasks', [
                'company_id' => $company->id,
                'title' => 'Not My Agent',
                'description' => 'Agent is not supervised by this supervisor.',
                'assigned_agent_id' => $agent->id,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('assigned_agent_id');
    }

    private function createTask(Company $company, User $creator, User $agent, array $overrides = []): Task
    {
        $task = Task::create(array_merge([
            'company_id' => $company->id,
            'created_by_user_id' => $creator->id,
            'assigned_agent_id' => $agent->id,
            'title' => 'Board Task',
            'type' => 'inspection',
            'description' => 'Task moved across board columns.',
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
            'assigned_by_user_id' => $creator->id,
            'assigned_agent_id' => $agent->id,
            'assigned_at' => now(),
            'is_current' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $task;
    }

    private function addMember(Company $company, string $role): User
    {
        $user = User::factory()->create(['email_verified_at' => now()]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $user->id,
            'role' => $role,
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $user;
    }

    private function seedCompanyUsers(): array
    {
        $company = Company::create([
            'company_id' => 'FAC-TASKDND1',
            'name' => 'Board Factory Ltd',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Field operations',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $admin = $this->addMember($company, 'admin');
        $agent = $this->addMember($company, 'agent');

        return [$company, $admin, $agent];
    }
}
