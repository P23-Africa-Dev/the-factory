<?php

declare(strict_types=1);

namespace Tests\Feature\Project;

use App\Models\Company;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ProjectManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_can_create_project_with_public_company_id(): void
    {
        [$company] = $this->seedCompanyUsers();

        $owner = User::factory()->create(['email_verified_at' => now()]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $owner->id,
            'role' => 'owner',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->withToken($owner->createToken('owner-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/projects', [
                'company_id' => strtolower($company->company_id),
                'name' => 'Owner Managed Project',
                'status' => 'planning',
                'start_date' => now()->toDateString(),
                'project_manager_user_id' => $owner->id,
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.project.company_id', $company->id)
            ->assertJsonPath('data.project.created_by_user_id', $owner->id)
            ->assertJsonPath('data.project.project_manager_user_id', $owner->id);
    }

    public function test_admin_can_create_project_with_attachment_and_zero_progress(): void
    {
        Storage::fake('public');

        [$company, $admin, $agent] = $this->seedCompanyUsers();

        $supervisor = User::factory()->create(['email_verified_at' => now()]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $supervisor->id,
            'role' => 'supervisor',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v1/projects', [
                'company_id' => $company->id,
                'name' => 'Product Outreach',
                'description' => 'Physical outreach and executive networking campaign.',
                'type' => 'sales',
                'status' => 'active',
                'priority' => 'high',
                'start_date' => now()->toDateString(),
                'end_date' => now()->addDays(2)->toDateString(),
                'project_manager_user_id' => $supervisor->id,
                'assigned_team' => [$agent->id],
                'territory_zone' => 'Lagos Mainland',
                'attachments' => [UploadedFile::fake()->create('brief.pdf', 200, 'application/pdf')],
                'notes' => 'Launch before weekend campaign window.',
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.project.name', 'Product Outreach')
            ->assertJsonPath('data.project.task_summary.total_tasks', 0)
            ->assertJsonPath('data.project.task_summary.completed_percentage', 0)
            ->assertJsonPath('data.project.duration_days', 3);

        $project = Project::query()->firstOrFail();

        $this->assertDatabaseHas('projects', [
            'id' => $project->id,
            'company_id' => $company->id,
            'project_manager_user_id' => $supervisor->id,
            'status' => 'active',
        ]);

        $this->assertDatabaseHas('project_users', [
            'project_id' => $project->id,
            'user_id' => $agent->id,
        ]);

        $this->assertDatabaseHas('project_files', [
            'project_id' => $project->id,
            'uploaded_by_user_id' => $admin->id,
            'original_name' => 'brief.pdf',
        ]);
    }

    public function test_admin_can_create_list_and_show_projects_with_public_company_id(): void
    {
        [$company, $admin] = $this->seedCompanyUsers();

        $supervisor = User::factory()->create(['email_verified_at' => now()]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $supervisor->id,
            'role' => 'supervisor',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $token = $admin->createToken('admin-token', ['*'])->plainTextToken;

        $createResponse = $this->withToken($token)
            ->postJson('/api/v1/projects', [
                'company_id' => strtolower($company->company_id),
                'name' => 'Public Company ID Project',
                'status' => 'planning',
                'start_date' => now()->toDateString(),
                'project_manager_user_id' => $supervisor->id,
            ]);

        $createResponse->assertCreated()
            ->assertJsonPath('data.project.company_id', $company->id)
            ->assertJsonPath('data.project.name', 'Public Company ID Project');

        $projectId = (int) $createResponse->json('data.project.id');

        $listResponse = $this->withToken($token)
            ->getJson('/api/v1/projects?company_id='.strtolower($company->company_id));

        $listResponse->assertOk()
            ->assertJsonPath('data.items.0.id', $projectId);

        $showResponse = $this->withToken($token)
            ->getJson('/api/v1/projects/'.$projectId.'?company_id='.strtolower($company->company_id));

        $showResponse->assertOk()
            ->assertJsonPath('data.project.id', $projectId)
            ->assertJsonPath('data.project.company_id', $company->id);
    }

    public function test_admin_can_create_project_without_manager_assignment(): void
    {
        [$company, $admin] = $this->seedCompanyUsers();

        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/projects', [
                'company_id' => $company->id,
                'name' => 'Unassigned Manager Project',
                'status' => 'planning',
                'start_date' => now()->toDateString(),
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.project.project_manager_user_id', null)
            ->assertJsonPath('data.project.manager', null);
    }

    public function test_project_listing_includes_progress_summary(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();

        $supervisor = User::factory()->create(['email_verified_at' => now()]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $supervisor->id,
            'role' => 'supervisor',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $project = Project::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'project_manager_user_id' => $supervisor->id,
            'name' => 'Territory Inspection',
            'status' => 'active',
            'priority' => 'medium',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addDays(5)->toDateString(),
            'duration_days' => 6,
        ]);

        Task::create([
            'company_id' => $company->id,
            'project_id' => $project->id,
            'created_by_user_id' => $admin->id,
            'assigned_agent_id' => $agent->id,
            'title' => 'Completed Visit',
            'type' => 'inspection',
            'description' => 'Completed territory inspection.',
            'location_text' => 'Yaba',
            'address_full' => 'Yaba, Lagos',
            'due_at' => now()->addDay(),
            'required_actions' => [],
            'priority' => 'medium',
            'minimum_photos_required' => 0,
            'visit_verification_required' => false,
            'status' => 'completed',
            'completed_at' => now(),
        ]);

        Task::create([
            'company_id' => $company->id,
            'project_id' => $project->id,
            'created_by_user_id' => $admin->id,
            'assigned_agent_id' => $agent->id,
            'title' => 'Pending Visit',
            'type' => 'inspection',
            'description' => 'Pending territory inspection.',
            'location_text' => 'Surulere',
            'address_full' => 'Surulere, Lagos',
            'due_at' => now()->addDays(2),
            'required_actions' => [],
            'priority' => 'medium',
            'minimum_photos_required' => 0,
            'visit_verification_required' => false,
            'status' => 'pending',
        ]);

        Task::create([
            'company_id' => $company->id,
            'project_id' => $project->id,
            'created_by_user_id' => $admin->id,
            'assigned_agent_id' => $agent->id,
            'title' => 'In Progress Visit',
            'type' => 'inspection',
            'description' => 'In progress territory inspection.',
            'location_text' => 'Lekki',
            'address_full' => 'Lekki, Lagos',
            'due_at' => now()->addDays(3),
            'required_actions' => [],
            'priority' => 'medium',
            'minimum_photos_required' => 0,
            'visit_verification_required' => false,
            'status' => 'in_progress',
        ]);

        $response = $this->withToken($supervisor->createToken('supervisor-token', ['*'])->plainTextToken)
            ->getJson('/api/v1/projects?company_id='.$company->id);

        $response->assertOk()
            ->assertJsonPath('data.items.0.id', $project->id)
            ->assertJsonPath('data.items.0.task_summary.total_tasks', 3)
            ->assertJsonPath('data.items.0.task_summary.completed_tasks', 1)
            ->assertJsonPath('data.items.0.task_summary.pending_tasks', 2)
            ->assertJsonPath('data.items.0.task_summary.completed_percentage', 33.33)
            ->assertJsonPath('data.items.0.task_summary.pending_percentage', 66.67);
    }

    public function test_agent_cannot_create_or_list_projects(): void
    {
        [$company, , $agent] = $this->seedCompanyUsers();

        $token = $agent->createToken('agent-token', ['*'])->plainTextToken;

        $createResponse = $this->withToken($token)->postJson('/api/v1/projects', [
            'company_id' => $company->id,
            'name' => 'Forbidden Project',
            'status' => 'planning',
            'start_date' => now()->toDateString(),
            'project_manager_user_id' => $agent->id,
        ]);

        $createResponse->assertUnprocessable();

        $listResponse = $this->withToken($token)
            ->getJson('/api/v1/projects?company_id='.$company->id);

        $listResponse->assertUnprocessable();
    }

    public function test_admin_can_create_task_under_project_without_breaking_task_api(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();

        $project = Project::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'project_manager_user_id' => $admin->id,
            'name' => 'Deployment Sprint',
            'status' => 'active',
            'start_date' => now()->toDateString(),
            'duration_days' => null,
        ]);

        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/tasks', [
                'company_id' => $company->id,
                'project_id' => $project->id,
                'title' => 'Deploy kiosk setup',
                'type' => 'delivery',
                'description' => 'Deploy kiosk setup and verify readiness.',
                'assigned_agent_id' => $agent->id,
                'location' => 'Ikeja City Mall',
                'address' => 'Obafemi Awolowo Way, Ikeja',
                'due_date' => now()->addDay()->toISOString(),
                'priority' => 'high',
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.task.project_id', $project->id);

        $this->assertDatabaseHas('tasks', [
            'company_id' => $company->id,
            'project_id' => $project->id,
            'assigned_agent_id' => $agent->id,
        ]);
    }

    public function test_agent_can_create_self_task_only_as_standalone(): void
    {
        [$company, , $agent] = $this->seedCompanyUsers();

        $response = $this->withToken($agent->createToken('agent-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/agent/tasks/self', [
                'company_id' => $company->id,
                'title' => 'Follow up route check',
                'type' => 'awareness',
                'description' => 'Self-created route check before the shift starts.',
                'location' => 'Apapa',
                'address' => 'Warehouse Road, Apapa',
                'due_date' => now()->addDay()->toISOString(),
                'priority' => 'low',
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.task.assigned_agent_id', $agent->id)
            ->assertJsonPath('data.task.created_by_user_id', $agent->id)
            ->assertJsonPath('data.task.project_id', null);

        $this->assertDatabaseHas('tasks', [
            'company_id' => $company->id,
            'created_by_user_id' => $agent->id,
            'assigned_agent_id' => $agent->id,
            'project_id' => null,
        ]);
    }

    public function test_project_creation_requires_company_context(): void
    {
        [, $admin, $agent] = $this->seedCompanyUsers();

        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/projects', [
                'name' => 'Missing Company Context',
                'status' => 'planning',
                'start_date' => now()->toDateString(),
                'project_manager_user_id' => $agent->id,
            ]);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['company_id']);
    }

    public function test_project_creation_accepts_project_manager_alias_field(): void
    {
        [$company, $admin] = $this->seedCompanyUsers();

        $supervisor = User::factory()->create(['email_verified_at' => now()]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $supervisor->id,
            'role' => 'supervisor',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/projects', [
                'company_id' => $company->id,
                'name' => 'Alias Manager Field Project',
                'status' => 'planning',
                'start_date' => now()->toDateString(),
                'project_manager' => $supervisor->id,
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.project.project_manager_user_id', $supervisor->id);
    }

    public function test_project_creation_rejects_cross_company_manager_assignment(): void
    {
        [$company, $admin] = $this->seedCompanyUsers();

        $otherCompany = Company::create([
            'company_id' => 'FAC-PROJ002',
            'name' => 'Other Company Ltd',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Cross company isolation test',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $externalSupervisor = User::factory()->create(['email_verified_at' => now()]);

        DB::table('company_users')->insert([
            'company_id' => $otherCompany->id,
            'user_id' => $externalSupervisor->id,
            'role' => 'supervisor',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/projects', [
                'company_id' => $company->id,
                'name' => 'Cross Company Manager Attempt',
                'status' => 'planning',
                'start_date' => now()->toDateString(),
                'project_manager_user_id' => $externalSupervisor->id,
            ]);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['project_manager_user_id']);
    }

    public function test_project_creation_rejects_cross_company_team_assignment(): void
    {
        [$company, $admin] = $this->seedCompanyUsers();

        $supervisor = User::factory()->create(['email_verified_at' => now()]);
        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $supervisor->id,
            'role' => 'supervisor',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $otherCompany = Company::create([
            'company_id' => 'FAC-PROJ003',
            'name' => 'Unrelated Company Ltd',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Team isolation test',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $externalAgent = User::factory()->create(['email_verified_at' => now()]);

        DB::table('company_users')->insert([
            'company_id' => $otherCompany->id,
            'user_id' => $externalAgent->id,
            'role' => 'agent',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/projects', [
                'company_id' => $company->id,
                'name' => 'Cross Company Team Attempt',
                'status' => 'planning',
                'start_date' => now()->toDateString(),
                'project_manager_user_id' => $supervisor->id,
                'assigned_team' => [$externalAgent->id],
            ]);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['assigned_team']);
    }

    private function seedCompanyUsers(): array
    {
        $company = Company::create([
            'company_id' => 'FAC-PROJ001',
            'name' => 'Project Factory Ltd',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Project and field operations management',
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
