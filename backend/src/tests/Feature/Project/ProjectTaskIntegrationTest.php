<?php

declare(strict_types=1);

namespace Tests\Feature\Project;

use App\Models\Company;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ProjectTaskIntegrationTest extends TestCase
{
    use RefreshDatabase;

    // ─────────────────────────────────────────────
    // Project Management Tests
    // ─────────────────────────────────────────────

    public function test_admin_can_create_project_without_manager(): void
    {
        [$company, $admin] = $this->seedCompany();

        $response = $this->withToken($admin->createToken('token', ['*'])->plainTextToken)
            ->postJson('/api/v1/projects', [
                'company_id' => $company->id,
                'name' => 'Lagos Distribution Network',
                'status' => 'planning',
                'start_date' => now()->toDateString(),
            ]);

        $response->assertCreated()
            ->assertJson(['success' => true])
            ->assertJsonPath('data.project.name', 'Lagos Distribution Network');

        $this->assertDatabaseHas('projects', [
            'company_id' => $company->id,
            'name' => 'Lagos Distribution Network',
            'project_manager_user_id' => null,
        ]);
    }

    public function test_admin_can_create_project_with_valid_manager(): void
    {
        [$company, $admin,, $supervisor] = $this->seedCompany();

        $response = $this->withToken($admin->createToken('token', ['*'])->plainTextToken)
            ->postJson('/api/v1/projects', [
                'company_id' => $company->id,
                'name' => 'Expansion Project',
                'status' => 'planning',
                'start_date' => now()->toDateString(),
                'project_manager_user_id' => $supervisor->id,
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.project.manager.id', $supervisor->id);
    }

    public function test_project_manager_must_belong_to_company(): void
    {
        [$company, $admin] = $this->seedCompany();

        $outsider = User::factory()->create(['email_verified_at' => now()]);

        $response = $this->withToken($admin->createToken('token', ['*'])->plainTextToken)
            ->postJson('/api/v1/projects', [
                'company_id' => $company->id,
                'name' => 'Bad Project',
                'status' => 'planning',
                'start_date' => now()->toDateString(),
                'project_manager_user_id' => $outsider->id,
            ]);

        $response->assertUnprocessable()
            ->assertJsonPath('errors.project_manager_user_id.0', 'Selected project manager is not a member of this company.');
    }

    public function test_project_manager_must_have_valid_role(): void
    {
        [$company, $admin, $agent] = $this->seedCompany();

        $response = $this->withToken($admin->createToken('token', ['*'])->plainTextToken)
            ->postJson('/api/v1/projects', [
                'company_id' => $company->id,
                'name' => 'Bad Role Project',
                'status' => 'planning',
                'start_date' => now()->toDateString(),
                'project_manager_user_id' => $agent->id,
            ]);

        $response->assertUnprocessable()
            ->assertJsonPath('errors.project_manager_user_id.0', 'Project manager must be an owner, admin, or supervisor.');
    }

    public function test_admin_can_update_project_to_remove_manager(): void
    {
        [$company, $admin,, $supervisor] = $this->seedCompany();

        $project = $this->createProject($company, $admin, $supervisor);

        $response = $this->withToken($admin->createToken('token', ['*'])->plainTextToken)
            ->patchJson('/api/v1/projects/' . $project->id, [
                'company_id' => $company->id,
                'project_manager_user_id' => null,
            ]);

        $response->assertOk()
            ->assertJson(['success' => true]);

        $this->assertDatabaseHas('projects', [
            'id' => $project->id,
            'project_manager_user_id' => null,
        ]);
    }

    public function test_admin_can_update_project_status_and_fields(): void
    {
        [$company, $admin] = $this->seedCompany();

        $project = $this->createProject($company, $admin);

        $response = $this->withToken($admin->createToken('token', ['*'])->plainTextToken)
            ->patchJson('/api/v1/projects/' . $project->id, [
                'company_id' => $company->id,
                'name' => 'Updated Name',
                'status' => 'active',
                'priority' => 'high',
            ]);

        $response->assertOk()
            ->assertJsonPath('data.project.name', 'Updated Name');

        $this->assertDatabaseHas('projects', [
            'id' => $project->id,
            'name' => 'Updated Name',
            'status' => 'active',
        ]);
    }

    // ─────────────────────────────────────────────
    // Task Creation Tests
    // ─────────────────────────────────────────────

    public function test_admin_can_create_minimal_task_with_only_title(): void
    {
        [$company, $admin] = $this->seedCompany();

        $response = $this->withToken($admin->createToken('token', ['*'])->plainTextToken)
            ->postJson('/api/v1/tasks', [
                'company_id' => $company->id,
                'title' => 'Minimal Task',
            ]);

        $response->assertCreated()
            ->assertJson(['success' => true])
            ->assertJsonPath('data.task.title', 'Minimal Task')
            ->assertJsonPath('data.task.project_id', null)
            ->assertJsonPath('data.task.assigned_agent_id', null)
            ->assertJsonPath('data.task.status', 'pending');

        $this->assertDatabaseHas('tasks', [
            'company_id' => $company->id,
            'title' => 'Minimal Task',
            'assigned_agent_id' => null,
            'project_id' => null,
        ]);
    }

    public function test_admin_can_create_task_linked_to_project(): void
    {
        [$company, $admin, $agent] = $this->seedCompany();

        $project = $this->createProject($company, $admin);

        $response = $this->withToken($admin->createToken('token', ['*'])->plainTextToken)
            ->postJson('/api/v1/tasks', [
                'company_id' => $company->id,
                'project_id' => $project->id,
                'title' => 'Project-Linked Task',
                'assigned_agent_id' => $agent->id,
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.task.project.id', $project->id)
            ->assertJsonPath('data.task.assignee.id', $agent->id);

        $this->assertDatabaseHas('tasks', [
            'project_id' => $project->id,
            'company_id' => $company->id,
        ]);
    }

    public function test_admin_can_create_standalone_task_without_project(): void
    {
        [$company, $admin, $agent] = $this->seedCompany();

        $response = $this->withToken($admin->createToken('token', ['*'])->plainTextToken)
            ->postJson('/api/v1/tasks', [
                'company_id' => $company->id,
                'title' => 'Standalone Task',
                'assigned_agent_id' => $agent->id,
                'description' => 'No project linked.',
                'type' => 'inspection',
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.task.project_id', null)
            ->assertJsonPath('data.task.project', null);
    }

    public function test_task_project_must_belong_to_same_company(): void
    {
        [$company, $admin, $agent] = $this->seedCompany();

        $otherCompany = $this->makeCompany('FAC-OTHER01');
        $otherAdmin = User::factory()->create(['email_verified_at' => now()]);
        DB::table('company_users')->insert([
            'company_id' => $otherCompany->id,
            'user_id' => $otherAdmin->id,
            'role' => 'admin',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $otherProject = $this->createProject($otherCompany, $otherAdmin);

        $response = $this->withToken($admin->createToken('token', ['*'])->plainTextToken)
            ->postJson('/api/v1/tasks', [
                'company_id' => $company->id,
                'title' => 'Cross-Company Project Task',
                'project_id' => $otherProject->id,
            ]);

        $response->assertUnprocessable()
            ->assertJsonPath('errors.project_id.0', 'Selected project does not belong to the active company context.');
    }

    // ─────────────────────────────────────────────
    // Task Assignment Tests
    // ─────────────────────────────────────────────

    public function test_admin_can_assign_multiple_agents_to_task(): void
    {
        [$company, $admin, $agent1] = $this->seedCompany();

        $agent2 = User::factory()->create(['email_verified_at' => now()]);
        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $agent2->id,
            'role' => 'agent',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $task = Task::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'assigned_agent_id' => $agent1->id,
            'title' => 'Multi-Agent Task',
            'status' => 'pending',
        ]);

        DB::table('task_assignments')->insert([
            'task_id' => $task->id,
            'assigned_by_user_id' => $admin->id,
            'assigned_agent_id' => $agent1->id,
            'assigned_at' => now(),
            'is_current' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->withToken($admin->createToken('token', ['*'])->plainTextToken)
            ->patchJson('/api/v1/tasks/' . $task->id . '/assign', [
                'company_id' => $company->id,
                'assigned_agent_id' => $agent2->id,
                'reason' => 'Load balancing transfer.',
            ]);

        $response->assertOk()
            ->assertJsonPath('data.reassignment.status', 'pending')
            ->assertJsonPath('data.reassignment.to_user_id', $agent2->id);

        $reassignmentId = (int) $response->json('data.reassignment.id');

        $acceptResponse = $this->withToken($agent2->createToken('agent2-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/tasks/reassignments/' . $reassignmentId . '/accept', [
                'company_id' => $company->id,
            ]);

        $acceptResponse->assertOk()
            ->assertJsonPath('data.reassignment.status', 'accepted');

        $this->assertDatabaseHas('task_assignments', [
            'task_id' => $task->id,
            'assigned_agent_id' => $agent2->id,
            'is_current' => true,
        ]);
    }

    public function test_assign_response_includes_assigned_users_with_names(): void
    {
        [$company, $admin, $agent] = $this->seedCompany();

        $task = Task::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'assigned_agent_id' => $agent->id,
            'title' => 'Assignment Response Test',
            'status' => 'pending',
        ]);

        DB::table('task_assignments')->insert([
            'task_id' => $task->id,
            'assigned_by_user_id' => $admin->id,
            'assigned_agent_id' => $agent->id,
            'assigned_at' => now(),
            'is_current' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->withToken($admin->createToken('token', ['*'])->plainTextToken)
            ->patchJson('/api/v1/tasks/' . $task->id . '/assign', [
                'company_id' => $company->id,
                'assigned_agent_id' => $agent->id,
            ]);

        $response->assertUnprocessable()
            ->assertJsonPath('errors.to_user_id.0', 'You must select a different user for reassignment.');
    }

    public function test_cross_company_agent_assignment_is_rejected(): void
    {
        [$company, $admin] = $this->seedCompany();

        $otherCompany = $this->makeCompany('FAC-OTHER02');
        $otherAgent = User::factory()->create(['email_verified_at' => now()]);
        DB::table('company_users')->insert([
            'company_id' => $otherCompany->id,
            'user_id' => $otherAgent->id,
            'role' => 'agent',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $task = Task::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'title' => 'Cross Tenant Task',
            'status' => 'pending',
        ]);

        $response = $this->withToken($admin->createToken('token', ['*'])->plainTextToken)
            ->patchJson('/api/v1/tasks/' . $task->id . '/assign', [
                'company_id' => $company->id,
                'assigned_agent_ids' => [$otherAgent->id],
            ]);

        $response->assertUnprocessable();
    }

    public function test_agent_sees_tasks_assigned_via_multi_agent_flow(): void
    {
        [$company, $admin, $agent1] = $this->seedCompany();

        $agent2 = User::factory()->create(['email_verified_at' => now()]);
        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $agent2->id,
            'role' => 'agent',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Create task without primary assigned_agent_id, only via task_assignments
        $task = Task::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'assigned_agent_id' => $agent2->id,
            'title' => 'Shared Assignment Task',
            'status' => 'pending',
        ]);

        DB::table('task_assignments')->insert([
            [
                'task_id' => $task->id,
                'assigned_by_user_id' => $admin->id,
                'assigned_agent_id' => $agent2->id,
                'assigned_at' => now(),
                'is_current' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'task_id' => $task->id,
                'assigned_by_user_id' => $admin->id,
                'assigned_agent_id' => $agent1->id,
                'assigned_at' => now(),
                'is_current' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        // agent1 should see this task (assigned via task_assignments even though not primary)
        $response = $this->withToken($agent1->createToken('token', ['*'])->plainTextToken)
            ->getJson('/api/v1/tasks?company_id=' . $company->id);

        $response->assertOk();
        $taskIds = array_column($response->json('data.items'), 'id');
        $this->assertContains($task->id, $taskIds);
    }

    // ─────────────────────────────────────────────
    // Edge Case Tests
    // ─────────────────────────────────────────────

    public function test_task_title_minimum_length_is_enforced(): void
    {
        [$company, $admin] = $this->seedCompany();

        $response = $this->withToken($admin->createToken('token', ['*'])->plainTextToken)
            ->postJson('/api/v1/tasks', [
                'company_id' => $company->id,
                'title' => 'ab', // too short
            ]);

        $response->assertUnprocessable()
            ->assertJsonStructure(['errors' => ['title']]);
    }

    public function test_task_with_invalid_project_id_is_rejected(): void
    {
        [$company, $admin] = $this->seedCompany();

        $response = $this->withToken($admin->createToken('token', ['*'])->plainTextToken)
            ->postJson('/api/v1/tasks', [
                'company_id' => $company->id,
                'title' => 'Task with Bad Project',
                'project_id' => 999999,
            ]);

        $response->assertUnprocessable()
            ->assertJsonStructure(['errors' => ['project_id']]);
    }

    public function test_task_optional_fields_are_stored_when_provided(): void
    {
        [$company, $admin, $agent] = $this->seedCompany();

        $response = $this->withToken($admin->createToken('token', ['*'])->plainTextToken)
            ->postJson('/api/v1/tasks', [
                'company_id' => $company->id,
                'title' => 'Full Data Task',
                'type' => 'inspection',
                'description' => 'Full description with all optional fields.',
                'assigned_agent_id' => $agent->id,
                'location' => 'Lekki Phase 1',
                'address' => '5 Admiralty Way, Lekki',
                'latitude' => 6.4320,
                'longitude' => 3.4695,
                'due_date' => now()->addDays(3)->toISOString(),
                'priority' => 'high',
                'minimum_photos_required' => 3,
                'visit_verification_required' => true,
            ]);

        $response->assertCreated();

        $this->assertDatabaseHas('tasks', [
            'company_id' => $company->id,
            'title' => 'Full Data Task',
            'type' => 'inspection',
            'priority' => 'high',
            'minimum_photos_required' => 3,
            'visit_verification_required' => true,
        ]);
    }

    public function test_project_end_date_before_start_date_is_rejected(): void
    {
        [$company, $admin] = $this->seedCompany();

        $response = $this->withToken($admin->createToken('token', ['*'])->plainTextToken)
            ->postJson('/api/v1/projects', [
                'company_id' => $company->id,
                'name' => 'Date Conflict Project',
                'status' => 'planning',
                'start_date' => now()->addWeek()->toDateString(),
                'end_date' => now()->toDateString(), // before start
            ]);

        $response->assertUnprocessable();
    }

    public function test_task_shows_assigned_users_in_list_response(): void
    {
        [$company, $admin, $agent] = $this->seedCompany();

        $task = Task::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'assigned_agent_id' => $agent->id,
            'title' => 'List Response Task',
            'status' => 'pending',
        ]);

        DB::table('task_assignments')->insert([
            'task_id' => $task->id,
            'assigned_by_user_id' => $admin->id,
            'assigned_agent_id' => $agent->id,
            'assigned_at' => now(),
            'is_current' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->withToken($admin->createToken('token', ['*'])->plainTextToken)
            ->getJson('/api/v1/tasks?company_id=' . $company->id);

        $response->assertOk();

        $item = $response->json('data.items.0');
        $this->assertArrayHasKey('assigned_users', $item);
        $this->assertNotEmpty($item['assigned_users']);
        $this->assertEquals($agent->id, $item['assigned_users'][0]['id']);
    }

    // ─────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────

    private function seedCompany(string $companyId = 'FAC-PIT001'): array
    {
        $company = $this->makeCompany($companyId);

        $admin = User::factory()->create(['email_verified_at' => now()]);
        $agent = User::factory()->create(['email_verified_at' => now()]);
        $supervisor = User::factory()->create(['email_verified_at' => now()]);

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
            [
                'company_id' => $company->id,
                'user_id' => $supervisor->id,
                'role' => 'supervisor',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        return [$company, $admin, $agent, $supervisor];
    }

    private function makeCompany(string $companyId): Company
    {
        return Company::create([
            'company_id' => $companyId,
            'name' => "Company {$companyId}",
            'country' => 'NG',
            'team_size' => '2-10',
            'use_case' => 'Field ops',
            'status' => 'active',
            'activated_at' => now(),
        ]);
    }

    private function createProject(Company $company, User $creator, ?User $manager = null): Project
    {
        return Project::create([
            'company_id' => $company->id,
            'created_by_user_id' => $creator->id,
            'project_manager_user_id' => $manager?->id,
            'name' => 'Test Project',
            'status' => 'planning',
            'start_date' => now()->toDateString(),
        ]);
    }
}
