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

        [$company, , $agent] = $this->seedCompanyUsers();

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
                    && $mailMessage->subject === 'New task assigned';
            },
        );
    }

    public function test_agent_receives_resend_notification_for_self_task_creation(): void
    {
        Notification::fake();

        [$company, , $agent] = $this->seedCompanyUsers();

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
                    && $mailMessage->subject === 'Self task created';
            },
        );
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
            ->getJson('/api/v1/tasks/'.$task->id.'?company_id='.$company->id);

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
            ->getJson('/api/v1/tasks?company_id='.strtolower($company->company_id));

        $listResponse->assertOk()
            ->assertJsonPath('data.items.0.id', $taskId)
            ->assertJsonPath('data.items.0.company_id', $company->id);

        $showResponse = $this->withToken($agentToken)
            ->getJson('/api/v1/tasks/'.$taskId.'?company_id='.strtolower($company->company_id));

        $showResponse->assertOk()
            ->assertJsonPath('data.task.id', $taskId)
            ->assertJsonPath('data.task.company_id', $company->id);
    }

    public function test_agent_cannot_create_task(): void
    {
        [$company, , $agent] = $this->seedCompanyUsers();

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
            ->getJson('/api/v1/tasks?company_id='.$company->id);

        $response->assertOk()
            ->assertJsonPath('data.items.0.id', $task1->id)
            ->assertJsonPath('data.items.0.assignee.id', $agent->id)
            ->assertJsonPath('data.items.0.creator.id', $admin->id)
            ->assertJsonCount(1, 'data.items');
    }

    public function test_agent_can_upload_proof_and_complete_task(): void
    {
        Storage::fake('local');

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
            ->post('/api/v1/tasks/'.$task->id.'/proofs', [
                'company_id' => $company->id,
                'file' => UploadedFile::fake()->image('proof.jpg', 1000, 1000),
                'latitude' => 6.45,
                'longitude' => 3.39,
                'notes' => 'Arrived and captured site photos.',
            ]);

        $uploadResponse->assertStatus(201)
            ->assertJson(['success' => true]);

        $proofPath = TaskProof::query()->value('file_path');

        $this->assertNotNull($proofPath);
        $this->assertTrue(Storage::disk('local')->exists((string) $proofPath));

        $inProgressResponse = $this->withToken($token)->patchJson('/api/v1/tasks/'.$task->id.'/status', [
            'company_id' => $company->id,
            'status' => 'in_progress',
        ]);

        $inProgressResponse->assertOk()
            ->assertJsonPath('data.task.status', 'in_progress');

        $statusResponse = $this->withToken($token)->patchJson('/api/v1/tasks/'.$task->id.'/status', [
            'company_id' => $company->id,
            'status' => 'completed',
        ]);

        $statusResponse->assertOk()
            ->assertJsonPath('data.task.status', 'completed');
    }

    public function test_agent_can_create_self_task_only_for_self(): void
    {
        [$company, , $agent] = $this->seedCompanyUsers();

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
            ->patchJson('/api/v1/tasks/'.$task->id.'/status', [
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

        $cancelResponse = $this->withToken($token)->patchJson('/api/v1/tasks/'.$task->id.'/status', [
            'company_id' => $company->id,
            'status' => 'cancelled',
        ]);

        $cancelResponse->assertOk()
            ->assertJsonPath('data.task.status', 'cancelled');

        $retryResponse = $this->withToken($token)->patchJson('/api/v1/tasks/'.$task->id.'/status', [
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
            ->patchJson('/api/v1/tasks/'.$task->id.'/assign', [
                'company_id' => $company->id,
                'assigned_agent_id' => $newAgent->id,
            ]);

        $response->assertOk()
            ->assertJsonPath('data.task.assigned_agent_id', $newAgent->id);
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
            ->patchJson('/api/v1/tasks/'.$task->id.'/assign', [
                'company_id' => $company->id,
                'assigned_agent_id' => $otherAgent->id,
            ]);

        $response->assertUnprocessable()
            ->assertJsonPath('errors.assigned_agent_id.0', 'Selected agent is not a member of this company.');
    }

    public function test_proof_download_is_restricted_to_owner_and_admin(): void
    {
        Storage::fake('local');

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

        $path = Storage::disk('local')->putFile(
            'task-proofs/company-'.$company->id.'/task-'.$task->id,
            UploadedFile::fake()->image('evidence.jpg')
        );

        $proof = TaskProof::create([
            'task_id' => $task->id,
            'uploaded_by_user_id' => $agent->id,
            'disk' => 'local',
            'file_path' => $path,
            'mime_type' => 'image/jpeg',
            'size_bytes' => 1024,
            'metadata' => ['original_name' => 'evidence.jpg'],
        ]);

        $adminResponse = $this->actingAs($admin, 'sanctum')
            ->get('/api/v1/tasks/'.$task->id.'/proofs/'.$proof->id.'?company_id='.$company->id);

        $adminResponse->assertOk();

        $ownerResponse = $this->actingAs($owner, 'sanctum')
            ->get('/api/v1/tasks/'.$task->id.'/proofs/'.$proof->id.'?company_id='.$company->id);

        $ownerResponse->assertOk();

        $supervisorResponse = $this->actingAs($supervisor, 'sanctum')
            ->getJson('/api/v1/tasks/'.$task->id.'/proofs/'.$proof->id.'?company_id='.$company->id);

        $supervisorResponse->assertUnprocessable()
            ->assertJsonPath('errors.authorization.0', 'Only owners and admins can view proof files.');

        $agentResponse = $this->actingAs($agent, 'sanctum')
            ->getJson('/api/v1/tasks/'.$task->id.'/proofs/'.$proof->id.'?company_id='.$company->id);

        $agentResponse->assertUnprocessable()
            ->assertJsonPath('errors.authorization.0', 'Only owners and admins can view proof files.');
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
