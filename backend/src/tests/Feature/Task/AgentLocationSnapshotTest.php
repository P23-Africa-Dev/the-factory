<?php

declare(strict_types=1);

namespace Tests\Feature\Task;

use App\Models\AgentLocationSnapshot;
use App\Models\Company;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AgentLocationSnapshotTest extends TestCase
{
    use RefreshDatabase;

    public function test_management_can_list_and_fetch_latest_agent_location_snapshots(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();

        $task = $this->createAssignedTask($company->id, $admin->id, $agent->id, [
            'status' => 'pending',
        ]);

        $agentToken = $agent->createToken('agent-location-start-token', ['*'])->plainTextToken;

        $this->withToken($agentToken)
            ->postJson('/api/v1/tasks/' . $task->id . '/start', [
                'company_id' => $company->id,
                'location_permission_granted' => true,
                'latitude' => 6.4000,
                'longitude' => 3.3900,
                'accuracy_meters' => 4,
            ])
            ->assertOk();

        $adminToken = $admin->createToken('admin-location-token', ['*'])->plainTextToken;

        $listResponse = $this->withToken($adminToken)
            ->getJson('/api/v1/agents/locations?company_id=' . $company->id);

        $listResponse->assertOk()
            ->assertJsonPath('data.items.0.agent.id', $agent->id)
            ->assertJsonPath('data.items.0.task.id', $task->id)
            ->assertJsonPath('data.items.0.status.is_online', true);

        $showResponse = $this->withToken($adminToken)
            ->getJson('/api/v1/agents/' . $agent->id . '/location?company_id=' . $company->id);

        $showResponse->assertOk()
            ->assertJsonPath('data.snapshot.agent.id', $agent->id)
            ->assertJsonPath('data.snapshot.task.id', $task->id)
            ->assertJsonPath('data.snapshot.location.latitude', 6.4)
            ->assertJsonPath('data.snapshot.status.is_online', true);
    }

    public function test_agent_cannot_fetch_other_agent_latest_snapshot(): void
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

        AgentLocationSnapshot::query()->create([
            'company_id' => $company->id,
            'user_id' => $agentTwo->id,
            'task_id' => null,
            'tracking_session_id' => null,
            'latitude' => 6.5000,
            'longitude' => 3.5000,
            'event_type' => 'movement',
            'task_status' => 'in_progress',
            'arrived' => false,
            'recorded_at' => now(),
            'last_seen_at' => now(),
        ]);

        $response = $this->withToken($agentOne->createToken('agent-one-token', ['*'])->plainTextToken)
            ->getJson('/api/v1/agents/' . $agentTwo->id . '/location?company_id=' . $company->id);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['authorization']);
    }

    public function test_cross_company_location_access_is_rejected(): void
    {
        [$companyOne, $adminOne] = $this->seedCompanyUsers('FAC-AGLOC001');
        [$companyTwo, $adminTwo, $agentTwo] = $this->seedCompanyUsers('FAC-AGLOC002');

        AgentLocationSnapshot::query()->create([
            'company_id' => $companyTwo->id,
            'user_id' => $agentTwo->id,
            'task_id' => null,
            'tracking_session_id' => null,
            'latitude' => 6.6100,
            'longitude' => 3.3300,
            'event_type' => 'movement',
            'task_status' => 'in_progress',
            'arrived' => false,
            'recorded_at' => now(),
            'last_seen_at' => now(),
        ]);

        $response = $this->withToken($adminOne->createToken('company-one-admin-token', ['*'])->plainTextToken)
            ->getJson('/api/v1/agents/locations?company_id=' . $companyTwo->id);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['company_id']);

        // Sanity check: company two admin can still access company two snapshots.
        $this->withToken($adminTwo->createToken('company-two-admin-token', ['*'])->plainTextToken)
            ->getJson('/api/v1/agents/locations?company_id=' . $companyTwo->id)
            ->assertOk()
            ->assertJsonPath('data.items.0.agent.id', $agentTwo->id);
    }

    public function test_stale_snapshot_is_reported_offline(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers('FAC-AGLOC003');

        AgentLocationSnapshot::query()->create([
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'task_id' => null,
            'tracking_session_id' => null,
            'latitude' => 6.7000,
            'longitude' => 3.3500,
            'event_type' => 'movement',
            'task_status' => 'in_progress',
            'arrived' => false,
            'recorded_at' => now()->subMinutes(30),
            'last_seen_at' => now()->subMinutes(30),
        ]);

        $response = $this->withToken($admin->createToken('stale-admin-token', ['*'])->plainTextToken)
            ->getJson('/api/v1/agents/locations?company_id=' . $company->id . '&stale_after_seconds=300');

        $response->assertOk()
            ->assertJsonPath('data.items.0.agent.id', $agent->id)
            ->assertJsonPath('data.items.0.status.is_online', false)
            ->assertJsonPath('data.items.0.status.is_stale', true);
    }

    private function createAssignedTask(int $companyId, int $creatorId, int $agentId, array $overrides = []): Task
    {
        $task = Task::query()->create(array_merge([
            'company_id' => $companyId,
            'created_by_user_id' => $creatorId,
            'assigned_agent_id' => $agentId,
            'title' => 'Agent Location Tracking Task',
            'type' => 'inspection',
            'description' => 'Agent location snapshot seed task.',
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

    private function seedCompanyUsers(string $companyCode = 'FAC-AGLOC001'): array
    {
        $company = Company::query()->create([
            'company_id' => $companyCode,
            'name' => 'Agent Location Factory Ltd',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Map live tracking read model',
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
