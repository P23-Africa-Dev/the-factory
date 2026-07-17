<?php

declare(strict_types=1);

namespace Tests\Feature\Task;

use App\Models\Company;
use App\Models\Project;
use App\Models\Task;
use App\Models\TaskProof;
use App\Models\User;
use App\Notifications\TaskAssignedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class TaskManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_can_create_standalone_task_and_assignee_receives_notification(): void
    {
        Notification::fake();

        [$company,, $agent] = $this->seedCompanyUsers();

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
            ->postJson('/api/v1/tasks', [
                'company_id' => strtolower($company->company_id),
                'title' => 'Owner Created Task',
                'description' => 'Owner creates a standalone task for an agent.',
                'assigned_agent_id' => $agent->id,
                'due_date' => now()->addDay()->toISOString(),
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.task.project_id', null)
            ->assertJsonPath('data.task.created_by_user_id', $owner->id)
            ->assertJsonPath('data.task.assigned_agent_id', $agent->id);

        Notification::assertSentTo(
            $agent,
            TaskAssignedNotification::class,
            function (TaskAssignedNotification $notification, array $channels) use ($agent): bool {
                $mailMessage = $notification->toMail($agent);

                return in_array('mail', $channels, true)
                    && $mailMessage->mailer === 'resend'
                    && $mailMessage->subject === 'New task assigned — Factory23';
            },
        );
    }

    public function test_agent_receives_resend_notification_for_self_task_creation(): void
    {
        Notification::fake();

        [$company,, $agent] = $this->seedCompanyUsers();

        $response = $this->withToken($agent->createToken('agent-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/agent/tasks/self', [
                'company_id' => $company->company_id,
                'title' => 'Self Route Review',
                'description' => 'Agent creates a standalone self task and receives a notification.',
                'due_date' => now()->addDay()->toISOString(),
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.task.project_id', null)
            ->assertJsonPath('data.task.assigned_agent_id', $agent->id);

        Notification::assertSentTo(
            $agent,
            TaskAssignedNotification::class,
            function (TaskAssignedNotification $notification, array $channels) use ($agent): bool {
                $mailMessage = $notification->toMail($agent);

                return in_array('mail', $channels, true)
                    && $mailMessage->mailer === 'resend'
                    && $mailMessage->subject === 'Task created — Factory23';
            },
        );
    }

    public function test_agent_project_task_list_is_filtered_to_only_assigned_tasks(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();

        $otherAgent = User::factory()->create(['email_verified_at' => now()]);
        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $otherAgent->id,
            'role' => 'agent',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $project = Project::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'project_manager_user_id' => $admin->id,
            'name' => 'Agent Scoped Project',
            'status' => 'active',
            'start_date' => now()->toDateString(),
        ]);

        $visibleTask = Task::create([
            'company_id' => $company->id,
            'project_id' => $project->id,
            'created_by_user_id' => $admin->id,
            'assigned_agent_id' => $agent->id,
            'title' => 'Visible Project Task',
            'type' => 'inspection',
            'description' => 'Task for authenticated agent.',
            'status' => 'pending',
        ]);

        Task::create([
            'company_id' => $company->id,
            'project_id' => $project->id,
            'created_by_user_id' => $admin->id,
            'assigned_agent_id' => $otherAgent->id,
            'title' => 'Hidden Project Task',
            'type' => 'inspection',
            'description' => 'Task for another agent.',
            'status' => 'pending',
        ]);

        $response = $this->withToken($agent->createToken('agent-token', ['*'])->plainTextToken)
            ->getJson('/api/v1/tasks?company_id=' . $company->id . '&project_id=' . $project->id);

        $response->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.id', $visibleTask->id)
            ->assertJsonPath('data.items.0.project_id', $project->id);
    }

    public function test_agent_self_task_rejects_project_id_to_enforce_standalone_flow(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();

        $project = Project::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'project_manager_user_id' => $admin->id,
            'name' => 'Self Task Restriction Project',
            'status' => 'planning',
            'start_date' => now()->toDateString(),
        ]);

        $response = $this->withToken($agent->createToken('agent-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/agent/tasks/self', [
                'company_id' => $company->id,
                'project_id' => $project->id,
                'title' => 'Should Fail',
                'description' => 'Self task cannot be linked to a project.',
                'due_date' => now()->addDay()->toISOString(),
            ]);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['project_id']);
    }

    public function test_secondary_current_assignee_can_view_task_details(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();

        $secondaryAgent = User::factory()->create(['email_verified_at' => now()]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $secondaryAgent->id,
            'role' => 'agent',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $task = Task::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'assigned_agent_id' => $agent->id,
            'title' => 'Shared Task Visibility',
            'type' => 'inspection',
            'description' => 'Task assigned to multiple current agents.',
            'location_text' => 'Ikeja',
            'address_full' => '1 Oba Akran Avenue, Ikeja',
            'due_at' => now()->addDay(),
            'required_actions' => [],
            'priority' => 'medium',
            'minimum_photos_required' => 0,
            'visit_verification_required' => false,
            'status' => 'pending',
        ]);

        DB::table('task_assignments')->insert([
            [
                'task_id' => $task->id,
                'assigned_by_user_id' => $admin->id,
                'assigned_agent_id' => $agent->id,
                'assigned_at' => now(),
                'is_current' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'task_id' => $task->id,
                'assigned_by_user_id' => $admin->id,
                'assigned_agent_id' => $secondaryAgent->id,
                'assigned_at' => now(),
                'is_current' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        $response = $this->withToken($secondaryAgent->createToken('secondary-agent-token', ['*'])->plainTextToken)
            ->getJson('/api/v1/tasks/' . $task->id . '?company_id=' . $company->id);

        $response->assertOk()
            ->assertJsonPath('data.task.id', $task->id);
    }

    public function test_admin_can_create_and_assign_task_to_agent(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();

        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/tasks', [
                'company_id' => $company->id,
                'title' => 'Visit New Distributor',
                'type' => 'sales_visit',
                'description' => 'Perform sales visit and collect onboarding requirements.',
                'assigned_agent_id' => $agent->id,
                'location' => 'Victoria Island',
                'address' => '12 Adeola Odeku Street, Lagos',
                'latitude' => 6.4281,
                'longitude' => 3.4219,
                'due_date' => now()->addDay()->toISOString(),
                'required_actions' => ['Take storefront photos', 'Capture competitor pricing'],
                'priority' => 'high',
                'minimum_photos_required' => 2,
                'visit_verification_required' => true,
            ]);

        $response->assertStatus(201)
            ->assertJson(['success' => true])
            ->assertJsonPath('data.task.creator.id', $admin->id)
            ->assertJsonPath('data.task.assignee.id', $agent->id);

        $this->assertDatabaseHas('tasks', [
            'company_id' => $company->id,
            'assigned_agent_id' => $agent->id,
            'status' => 'pending',
            'type' => 'sales_visit',
            'priority' => 'high',
        ]);

        $task = Task::query()->firstOrFail();

        $this->assertDatabaseHas('task_assignments', [
            'task_id' => $task->id,
            'assigned_agent_id' => $agent->id,
            'is_current' => true,
        ]);
    }

    public function test_admin_cannot_create_task_without_company_context(): void
    {
        [, $admin, $agent] = $this->seedCompanyUsers();

        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/tasks', [
                'title' => 'Missing Company Context',
                'type' => 'inspection',
                'description' => 'This task should be rejected when company context is missing.',
                'assigned_agent_id' => $agent->id,
                'due_date' => now()->addDay()->toISOString(),
            ]);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['company_id']);
    }

    public function test_admin_and_agent_can_use_public_company_id_for_task_endpoints(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();

        $createResponse = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/tasks', [
                'company_id' => strtolower($company->company_id),
                'title' => 'Public ID Task',
                'type' => 'sales_visit',
                'description' => 'Task created with public company identifier.',
                'assigned_agent_id' => $agent->id,
                'location' => 'Victoria Island',
                'address' => '12 Adeola Odeku Street, Lagos',
                'due_date' => now()->addDay()->toISOString(),
                'priority' => 'high',
            ]);

        $createResponse->assertCreated()
            ->assertJsonPath('data.task.company_id', $company->id)
            ->assertJsonPath('data.task.assignee.id', $agent->id);

        $taskId = (int) $createResponse->json('data.task.id');

        $agentToken = $agent->createToken('agent-token', ['*'])->plainTextToken;

        $listResponse = $this->withToken($agentToken)
            ->getJson('/api/v1/tasks?company_id=' . strtolower($company->company_id));

        $listResponse->assertOk()
            ->assertJsonPath('data.items.0.id', $taskId)
            ->assertJsonPath('data.items.0.company_id', $company->id);

        $showResponse = $this->withToken($agentToken)
            ->getJson('/api/v1/tasks/' . $taskId . '?company_id=' . strtolower($company->company_id));

        $showResponse->assertOk()
            ->assertJsonPath('data.task.id', $taskId)
            ->assertJsonPath('data.task.company_id', $company->id);
    }

    public function test_agent_cannot_create_task(): void
    {
        [$company,, $agent] = $this->seedCompanyUsers();

        $response = $this->withToken($agent->createToken('agent-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/tasks', [
                'company_id' => $company->id,
                'title' => 'Unauthorized Task',
                'type' => 'inspection',
                'description' => 'This should not be allowed for agents.',
                'assigned_agent_id' => $agent->id,
                'location' => 'Yaba',
                'address' => '12 Herbert Macaulay Way, Lagos',
                'due_date' => now()->addDay()->toISOString(),
                'priority' => 'medium',
            ]);

        $response->assertUnprocessable()
            ->assertJson(['success' => false]);
    }

    public function test_supervisor_can_create_project_linked_task(): void
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
            'name' => 'Retail Expansion',
            'description' => 'Launch retail activation campaign.',
            'type' => 'inspection',
            'status' => 'active',
            'priority' => 'high',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addWeek()->toDateString(),
            'duration_days' => 7,
            'territory_zone' => 'Lagos Island',
        ]);

        $response = $this->withToken($supervisor->createToken('supervisor-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/tasks', [
                'company_id' => $company->id,
                'project_id' => $project->id,
                'title' => 'Project Task',
                'type' => 'inspection',
                'description' => 'Inspect launch booths for compliance.',
                'assigned_agent_id' => $agent->id,
                'location' => 'Lagos Island',
                'address' => '1 Marina Road, Lagos',
                'due_date' => now()->addDay()->toISOString(),
                'priority' => 'medium',
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.task.project.id', $project->id)
            ->assertJsonPath('data.task.creator.id', $supervisor->id)
            ->assertJsonPath('data.task.assignee.id', $agent->id);
    }

    public function test_agent_sees_only_assigned_tasks(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();

        $otherAgent = User::factory()->create(['email_verified_at' => now()]);
        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $otherAgent->id,
            'role' => 'agent',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $task1 = Task::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'assigned_agent_id' => $agent->id,
            'title' => 'Assigned Task',
            'type' => 'delivery',
            'description' => 'Deliver package to customer.',
            'location_text' => 'Ikeja',
            'address_full' => '12 Allen Ave, Ikeja',
            'due_at' => now()->addDay(),
            'required_actions' => [],
            'priority' => 'low',
            'minimum_photos_required' => 0,
            'visit_verification_required' => false,
            'status' => 'pending',
        ]);

        Task::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'assigned_agent_id' => $otherAgent->id,
            'title' => 'Other Agent Task',
            'type' => 'collection',
            'description' => 'Collect signed documents.',
            'location_text' => 'Lekki',
            'address_full' => '4 Admiralty Way, Lekki',
            'due_at' => now()->addDay(),
            'required_actions' => [],
            'priority' => 'medium',
            'minimum_photos_required' => 0,
            'visit_verification_required' => false,
            'status' => 'pending',
        ]);

        $response = $this->withToken($agent->createToken('agent-token', ['*'])->plainTextToken)
            ->getJson('/api/v1/tasks?company_id=' . $company->id);

        $response->assertOk()
            ->assertJsonPath('data.items.0.id', $task1->id)
            ->assertJsonPath('data.items.0.assignee.id', $agent->id)
            ->assertJsonPath('data.items.0.creator.id', $admin->id)
            ->assertJsonCount(1, 'data.items');
    }

    public function test_management_can_filter_tasks_by_project_id(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();

        $projectA = Project::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'project_manager_user_id' => $admin->id,
            'name' => 'Project A',
            'status' => 'active',
            'start_date' => now()->toDateString(),
        ]);

        $projectB = Project::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'project_manager_user_id' => $admin->id,
            'name' => 'Project B',
            'status' => 'active',
            'start_date' => now()->toDateString(),
        ]);

        $taskA = Task::create([
            'company_id' => $company->id,
            'project_id' => $projectA->id,
            'created_by_user_id' => $admin->id,
            'assigned_agent_id' => $agent->id,
            'title' => 'Task A',
            'description' => 'Task under project A.',
            'status' => 'pending',
        ]);

        Task::create([
            'company_id' => $company->id,
            'project_id' => $projectB->id,
            'created_by_user_id' => $admin->id,
            'assigned_agent_id' => $agent->id,
            'title' => 'Task B',
            'description' => 'Task under project B.',
            'status' => 'pending',
        ]);

        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->getJson('/api/v1/tasks?company_id=' . $company->id . '&project_id=' . $projectA->id);

        $response->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.id', $taskA->id)
            ->assertJsonPath('data.items.0.project.id', $projectA->id);
    }

    public function test_management_can_update_task_status_via_admin_endpoint(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();

        $task = Task::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'assigned_agent_id' => $agent->id,
            'title' => 'Manager Controlled Task',
            'description' => 'Status should be updated by management endpoint.',
            'status' => 'pending',
        ]);

        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->patchJson('/api/v1/admin/tasks/' . $task->id . '/status', [
                'company_id' => $company->id,
                'status' => 'in_progress',
            ]);

        $response->assertOk()
            ->assertJsonPath('data.task.id', $task->id)
            ->assertJsonPath('data.task.status', 'in_progress');

        $this->assertDatabaseHas('tasks', [
            'id' => $task->id,
            'status' => 'in_progress',
            'last_status_updated_by_user_id' => $admin->id,
        ]);
    }

    public function test_management_can_move_completed_task_backward_to_in_progress_and_pending(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();

        $task = Task::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'assigned_agent_id' => $agent->id,
            'title' => 'Reopenable Task',
            'description' => 'Management should be able to reopen completed tasks.',
            'status' => 'completed',
            'started_at' => now()->subHour(),
            'completed_at' => now()->subMinutes(10),
        ]);

        $token = $admin->createToken('admin-token', ['*'])->plainTextToken;

        $reopenResponse = $this->withToken($token)
            ->patchJson('/api/v1/admin/tasks/' . $task->id . '/status', [
                'company_id' => $company->id,
                'status' => 'in_progress',
            ]);

        $reopenResponse->assertOk()
            ->assertJsonPath('data.task.status', 'in_progress')
            ->assertJsonPath('data.task.completed_at', null);

        $task->refresh();
        $this->assertSame('in_progress', $task->status?->value);
        $this->assertNull($task->completed_at);
        $this->assertNotNull($task->started_at);

        $revertResponse = $this->withToken($token)
            ->patchJson('/api/v1/admin/tasks/' . $task->id . '/status', [
                'company_id' => $company->id,
                'status' => 'pending',
            ]);

        $revertResponse->assertOk()
            ->assertJsonPath('data.task.status', 'pending')
            ->assertJsonPath('data.task.started_at', null)
            ->assertJsonPath('data.task.completed_at', null);

        $this->assertDatabaseHas('tasks', [
            'id' => $task->id,
            'status' => 'pending',
            'started_at' => null,
            'completed_at' => null,
        ]);
    }

    public function test_management_can_pause_and_resume_task_via_admin_endpoint(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();

        $task = Task::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'assigned_agent_id' => $agent->id,
            'title' => 'Pause Resume Task',
            'description' => 'Task should support management pause and resume transitions.',
            'status' => 'in_progress',
            'started_at' => now()->subMinutes(15),
        ]);

        $token = $admin->createToken('admin-token', ['*'])->plainTextToken;

        $pauseResponse = $this->withToken($token)
            ->patchJson('/api/v1/admin/tasks/' . $task->id . '/status', [
                'company_id' => $company->id,
                'status' => 'paused',
            ]);

        $pauseResponse->assertOk()
            ->assertJsonPath('data.task.status', 'paused');

        $this->assertNotNull($pauseResponse->json('data.task.paused_at'));

        $this->assertDatabaseHas('tasks', [
            'id' => $task->id,
            'status' => 'paused',
        ]);

        $resumeResponse = $this->withToken($token)
            ->patchJson('/api/v1/admin/tasks/' . $task->id . '/status', [
                'company_id' => $company->id,
                'status' => 'resumed',
            ]);

        $resumeResponse->assertOk()
            ->assertJsonPath('data.task.status', 'resumed');

        $this->assertNotNull($resumeResponse->json('data.task.resumed_at'));

        $this->assertDatabaseHas('tasks', [
            'id' => $task->id,
            'status' => 'resumed',
        ]);
    }

    public function test_agent_can_upload_proof_and_complete_task(): void
    {
        Storage::fake('local');
        Storage::fake('drive');

        [$company, $admin, $agent] = $this->seedCompanyUsers();

        $task = Task::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'assigned_agent_id' => $agent->id,
            'title' => 'Inspection Task',
            'type' => 'inspection',
            'description' => 'Inspect branch setup.',
            'location_text' => 'Surulere',
            'address_full' => '5 Bode Thomas, Surulere',
            'due_at' => now()->addDay(),
            'required_actions' => ['Take front and back images'],
            'priority' => 'high',
            'minimum_photos_required' => 1,
            'visit_verification_required' => true,
            'status' => 'pending',
        ]);

        $token = $agent->createToken('agent-token', ['*'])->plainTextToken;

        $uploadResponse = $this->withToken($token)
            ->withHeader('Accept', 'application/json')
            ->post('/api/v1/tasks/' . $task->id . '/proofs', [
                'company_id' => $company->id,
                'file' => UploadedFile::fake()->image('proof.jpg', 1000, 1000),
                'latitude' => 6.45,
                'longitude' => 3.39,
                'notes' => 'Arrived and captured site photos.',
            ]);

        $uploadResponse->assertStatus(201)
            ->assertJson(['success' => true]);

        $proof = TaskProof::query()->first();

        $this->assertNotNull($proof);
        $this->assertSame('drive', $proof->disk);
        $this->assertTrue(Storage::disk('drive')->exists((string) $proof->file_path));

        $inProgressResponse = $this->withToken($token)->patchJson('/api/v1/tasks/' . $task->id . '/status', [
            'company_id' => $company->id,
            'status' => 'in_progress',
        ]);

        $inProgressResponse->assertOk()
            ->assertJsonPath('data.task.status', 'in_progress');

        $statusResponse = $this->withToken($token)->patchJson('/api/v1/tasks/' . $task->id . '/status', [
            'company_id' => $company->id,
            'status' => 'completed',
        ]);

        $statusResponse->assertOk()
            ->assertJsonPath('data.task.status', 'completed');
    }

    public function test_agent_can_move_assigned_completed_task_backward_to_in_progress_and_pending(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();

        $task = Task::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'assigned_agent_id' => $agent->id,
            'title' => 'Agent Reopen Task',
            'description' => 'Assigned agent should reopen completed task for correction.',
            'status' => 'completed',
            'started_at' => now()->subHour(),
            'completed_at' => now()->subMinutes(5),
            'minimum_photos_required' => 0,
            'visit_verification_required' => false,
        ]);

        $token = $agent->createToken('agent-token', ['*'])->plainTextToken;

        $reopenResponse = $this->withToken($token)->patchJson('/api/v1/tasks/' . $task->id . '/status', [
            'company_id' => $company->id,
            'status' => 'in_progress',
        ]);

        $reopenResponse->assertOk()
            ->assertJsonPath('data.task.status', 'in_progress')
            ->assertJsonPath('data.task.completed_at', null);

        $revertResponse = $this->withToken($token)->patchJson('/api/v1/tasks/' . $task->id . '/status', [
            'company_id' => $company->id,
            'status' => 'pending',
        ]);

        $revertResponse->assertOk()
            ->assertJsonPath('data.task.status', 'pending')
            ->assertJsonPath('data.task.started_at', null)
            ->assertJsonPath('data.task.completed_at', null);
    }

    public function test_agent_can_create_self_task_only_for_self(): void
    {
        [$company,, $agent] = $this->seedCompanyUsers();

        $response = $this->withToken($agent->createToken('agent-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/agent/tasks/self', [
                'company_id' => $company->id,
                'title' => 'Personal Route Prep',
                'type' => 'awareness',
                'description' => 'Prepare the route checklist before the shift starts.',
                'location' => 'Yaba',
                'address' => '11 Commercial Avenue, Yaba',
                'due_date' => now()->addDay()->toISOString(),
                'priority' => 'low',
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.task.project_id', null)
            ->assertJsonPath('data.task.created_by_user_id', $agent->id)
            ->assertJsonPath('data.task.assigned_agent_id', $agent->id);
    }

    public function test_agent_self_task_rejects_assign_to_payload(): void
    {
        [$company,, $agent] = $this->seedCompanyUsers();

        $response = $this->withToken($agent->createToken('agent-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/agent/tasks/self', [
                'company_id' => $company->id,
                'title' => 'Self Assigned Attempt',
                'description' => 'Agents cannot choose another assignee during self task creation.',
                'assigned_agent_id' => $agent->id,
                'due_date' => now()->addDay()->toISOString(),
            ]);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['assigned_agent_id']);
    }

    public function test_agent_cannot_create_self_task_without_company_context(): void
    {
        [,, $agent] = $this->seedCompanyUsers();

        $response = $this->withToken($agent->createToken('agent-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/agent/tasks/self', [
                'title' => 'Self Task Without Context',
                'description' => 'Self task creation should fail when company context is missing.',
                'due_date' => now()->addDay()->toISOString(),
            ]);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['company_id']);
    }

    public function test_agent_cannot_complete_task_without_required_proofs(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();

        $task = Task::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'assigned_agent_id' => $agent->id,
            'title' => 'Awareness Campaign',
            'type' => 'awareness',
            'description' => 'Run awareness campaign at market.',
            'location_text' => 'Onitsha',
            'address_full' => 'Main Market, Onitsha',
            'due_at' => now()->addDay(),
            'required_actions' => ['Capture at least two photos'],
            'priority' => 'medium',
            'minimum_photos_required' => 2,
            'visit_verification_required' => false,
            'status' => 'in_progress',
        ]);

        $response = $this->withToken($agent->createToken('agent-token', ['*'])->plainTextToken)
            ->patchJson('/api/v1/tasks/' . $task->id . '/status', [
                'company_id' => $company->id,
                'status' => 'completed',
            ]);

        $response->assertUnprocessable()
            ->assertJson(['success' => false]);
    }

    public function test_agent_can_cancel_only_from_allowed_states(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();

        $task = Task::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'assigned_agent_id' => $agent->id,
            'title' => 'Campaign Setup',
            'type' => 'awareness',
            'description' => 'Prepare event stand before launch.',
            'location_text' => 'Lekki',
            'address_full' => '12 Admiralty Way, Lekki',
            'due_at' => now()->addDay(),
            'required_actions' => [],
            'priority' => 'medium',
            'minimum_photos_required' => 0,
            'visit_verification_required' => false,
            'status' => 'pending',
        ]);

        $token = $agent->createToken('agent-token', ['*'])->plainTextToken;

        $cancelResponse = $this->withToken($token)->patchJson('/api/v1/tasks/' . $task->id . '/status', [
            'company_id' => $company->id,
            'status' => 'cancelled',
        ]);

        $cancelResponse->assertOk()
            ->assertJsonPath('data.task.status', 'cancelled');

        $retryResponse = $this->withToken($token)->patchJson('/api/v1/tasks/' . $task->id . '/status', [
            'company_id' => $company->id,
            'status' => 'in_progress',
        ]);

        $retryResponse->assertUnprocessable()
            ->assertJsonPath('errors.status.0', 'Terminal tasks cannot be changed.');
    }

    public function test_supervisor_can_reassign_task(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();

        $supervisor = User::factory()->create(['email_verified_at' => now()]);
        $newAgent = User::factory()->create(['email_verified_at' => now()]);

        DB::table('company_users')->insert([
            [
                'company_id' => $company->id,
                'user_id' => $supervisor->id,
                'role' => 'supervisor',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'company_id' => $company->id,
                'user_id' => $newAgent->id,
                'role' => 'agent',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        $task = Task::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'assigned_agent_id' => $agent->id,
            'title' => 'Collection Task',
            'type' => 'collection',
            'description' => 'Collect signed contracts.',
            'location_text' => 'Abuja',
            'address_full' => 'Area 11, Abuja',
            'due_at' => now()->addDay(),
            'required_actions' => [],
            'priority' => 'low',
            'minimum_photos_required' => 0,
            'visit_verification_required' => false,
            'status' => 'pending',
        ]);

        $response = $this->withToken($supervisor->createToken('supervisor-token', ['*'])->plainTextToken)
            ->patchJson('/api/v1/tasks/' . $task->id . '/assign', [
                'company_id' => $company->id,
                'assigned_agent_id' => $newAgent->id,
                'reason' => 'Coverage gap in current zone.',
            ]);

        $response->assertOk()
            ->assertJsonPath('data.reassignment.status', 'pending')
            ->assertJsonPath('data.reassignment.to_user_id', $newAgent->id);

        $reassignmentId = (int) $response->json('data.reassignment.id');

        $acceptResponse = $this->withToken($newAgent->createToken('new-agent-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/tasks/reassignments/' . $reassignmentId . '/accept', [
                'company_id' => $company->id,
            ]);

        $acceptResponse->assertOk()
            ->assertJsonPath('data.reassignment.status', 'accepted')
            ->assertJsonPath('data.reassignment.to_user_id', $newAgent->id);

        $task->refresh();
        $this->assertSame($newAgent->id, $task->assigned_agent_id);

        $this->assertDatabaseHas('task_assignments', [
            'task_id' => $task->id,
            'assigned_agent_id' => $newAgent->id,
            'is_current' => true,
        ]);
    }

    public function test_cross_company_assignment_is_rejected(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();

        $otherCompany = Company::create([
            'company_id' => 'FAC-TASK002',
            'name' => 'Other Company Ltd',
            'country' => 'NG',
            'team_size' => '2-10',
            'use_case' => 'Separate tenant',
            'status' => 'active',
            'activated_at' => now(),
        ]);

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
            'assigned_agent_id' => $agent->id,
            'title' => 'Same Tenant Task',
            'type' => 'inspection',
            'description' => 'Tenant boundary validation.',
            'location_text' => 'Ikeja',
            'address_full' => '5 Oba Akran Avenue, Ikeja',
            'due_at' => now()->addDay(),
            'required_actions' => [],
            'priority' => 'medium',
            'minimum_photos_required' => 0,
            'visit_verification_required' => false,
            'status' => 'pending',
        ]);

        $response = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->patchJson('/api/v1/tasks/' . $task->id . '/assign', [
                'company_id' => $company->id,
                'assigned_agent_id' => $otherAgent->id,
            ]);

        $response->assertUnprocessable()
            ->assertJsonPath('errors.to_user_id.0', 'Selected user is not a member of this company.');
    }

    public function test_old_owner_can_view_reassigned_task_but_cannot_update_it(): void
    {
        [$company, $admin, $oldOwner] = $this->seedCompanyUsers();

        $newOwner = User::factory()->create(['email_verified_at' => now()]);
        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $newOwner->id,
            'role' => 'agent',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $task = Task::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'assigned_agent_id' => $oldOwner->id,
            'title' => 'Transfer Visibility Task',
            'type' => 'inspection',
            'description' => 'Ensures previous owner has read-only access post transfer.',
            'location_text' => 'Yaba',
            'address_full' => 'Herbert Macaulay Way, Yaba',
            'due_at' => now()->addDay(),
            'required_actions' => [],
            'priority' => 'medium',
            'minimum_photos_required' => 0,
            'visit_verification_required' => false,
            'status' => 'pending',
        ]);

        DB::table('task_assignments')->insert([
            'task_id' => $task->id,
            'assigned_by_user_id' => $admin->id,
            'assigned_agent_id' => $oldOwner->id,
            'assigned_at' => now(),
            'is_current' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $requestResponse = $this->withToken($admin->createToken('admin-token', ['*'])->plainTextToken)
            ->patchJson('/api/v1/tasks/' . $task->id . '/assign', [
                'company_id' => $company->id,
                'assigned_agent_id' => $newOwner->id,
            ]);

        $requestResponse->assertOk();

        $reassignmentId = (int) $requestResponse->json('data.reassignment.id');

        $this->withToken($newOwner->createToken('new-owner-token', ['*'])->plainTextToken)
            ->postJson('/api/v1/tasks/reassignments/' . $reassignmentId . '/accept', [
                'company_id' => $company->id,
            ])
            ->assertOk();

        $viewResponse = $this->withToken($oldOwner->createToken('old-owner-token', ['*'])->plainTextToken)
            ->getJson('/api/v1/tasks/' . $task->id . '?company_id=' . $company->id);

        $viewResponse->assertOk()
            ->assertJsonPath('data.task.id', $task->id);

        $updateResponse = $this->withToken($oldOwner->createToken('old-owner-status-token', ['*'])->plainTextToken)
            ->patchJson('/api/v1/tasks/' . $task->id . '/status', [
                'company_id' => $company->id,
                'status' => 'in_progress',
            ]);

        $updateResponse->assertUnprocessable();
    }

    public function test_proof_download_is_restricted_to_owner_and_admin(): void
    {
        Storage::fake('local');
        Storage::fake('drive');

        [$company, $admin, $agent] = $this->seedCompanyUsers();

        /** @var User $owner */
        $owner = User::factory()->create(['email_verified_at' => now()]);
        /** @var User $supervisor */
        $supervisor = User::factory()->create(['email_verified_at' => now()]);

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
                'user_id' => $supervisor->id,
                'role' => 'supervisor',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        $task = Task::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'assigned_agent_id' => $agent->id,
            'title' => 'Proof Download Task',
            'type' => 'inspection',
            'description' => 'Validate proof access control.',
            'location_text' => 'Victoria Island',
            'address_full' => '8 Ahmadu Bello Way, Lagos',
            'due_at' => now()->addDay(),
            'required_actions' => [],
            'priority' => 'medium',
            'minimum_photos_required' => 0,
            'visit_verification_required' => false,
            'status' => 'pending',
        ]);

        $path = Storage::disk('drive')->putFile(
            'task-proofs/company-' . $company->id . '/task-' . $task->id,
            UploadedFile::fake()->image('evidence.jpg')
        );

        $proof = TaskProof::create([
            'task_id' => $task->id,
            'uploaded_by_user_id' => $agent->id,
            'disk' => 'drive',
            'file_path' => $path,
            'mime_type' => 'image/jpeg',
            'size_bytes' => 1024,
            'metadata' => ['original_name' => 'evidence.jpg'],
        ]);

        $adminResponse = $this->actingAs($admin, 'sanctum')
            ->get('/api/v1/tasks/' . $task->id . '/proofs/' . $proof->id . '?company_id=' . $company->id);

        $adminResponse->assertOk();

        $ownerResponse = $this->actingAs($owner, 'sanctum')
            ->get('/api/v1/tasks/' . $task->id . '/proofs/' . $proof->id . '?company_id=' . $company->id);

        $ownerResponse->assertOk();

        $taskDetailResponse = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/tasks/' . $task->id . '?company_id=' . $company->id);

        $taskDetailResponse->assertOk()
            ->assertJsonPath('data.task.proofs.0.file_name', 'evidence.jpg');

        $supervisorResponse = $this->actingAs($supervisor, 'sanctum')
            ->getJson('/api/v1/tasks/' . $task->id . '/proofs/' . $proof->id . '?company_id=' . $company->id);

        $supervisorResponse->assertUnprocessable()
            ->assertJsonPath('errors.authorization.0', 'Only owners and admins can view proof files.');

        $agentResponse = $this->actingAs($agent, 'sanctum')
            ->getJson('/api/v1/tasks/' . $task->id . '/proofs/' . $proof->id . '?company_id=' . $company->id);

        $agentResponse->assertUnprocessable()
            ->assertJsonPath('errors.authorization.0', 'Only owners and admins can view proof files.');

        Storage::disk('drive')->delete((string) $proof->file_path);

        $missingResponse = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/tasks/' . $task->id . '/proofs/' . $proof->id . '?company_id=' . $company->id);

        $missingResponse->assertNotFound()
            ->assertJsonPath('message', 'Proof file is no longer available.');
    }

    private function seedCompanyUsers(): array
    {
        $company = Company::create([
            'company_id' => 'FAC-TASK001',
            'name' => 'Task Factory Ltd',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Field operations and workforce management',
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
