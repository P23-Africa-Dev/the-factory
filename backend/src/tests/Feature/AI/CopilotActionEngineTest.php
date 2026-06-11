<?php

declare(strict_types=1);

namespace Tests\Feature\AI;

use App\Enums\TaskType;
use App\Models\Company;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

final class CopilotActionEngineTest extends TestCase
{
    use RefreshDatabase;

    public function test_management_role_can_execute_tasks_create_action(): void
    {
        [$company, $admin] = $this->seedCompanyUser('admin');

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Create task for tomorrow morning dispatch prep',
                'action_confirmed' => true,
                'action_args' => [
                    'title' => 'Dispatch checklist run',
                    'type' => TaskType::INSPECTION->value,
                    'description' => 'Run the dispatch checklist and validate truck readiness.',
                    'location' => 'Ops Yard',
                    'address' => '32 Industrial Avenue, Lagos',
                    'due_date' => now()->addDay()->toIso8601String(),
                ],
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'tasks.create')
            ->assertJsonPath('data.response.sources.0', 'tasks.create');

        $this->assertDatabaseHas('tasks', [
            'company_id' => $company->id,
            'title' => 'Dispatch checklist run',
        ]);
    }

    public function test_agent_is_denied_from_management_action_tool(): void
    {
        [$company, $agent] = $this->seedCompanyUser('agent');

        $response = $this
            ->actingAs($agent)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'create task now',
                'action_confirmed' => true,
                'action_args' => [
                    'title' => 'Unauthorized task attempt',
                    'type' => TaskType::INSPECTION->value,
                    'description' => 'Attempting write action as agent should fail policy.',
                    'location' => 'Field',
                    'address' => '12 Atlantic Road, Lagos',
                    'due_date' => now()->addDay()->toIso8601String(),
                ],
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'tasks.create')
            ->assertJsonPath('data.response.payload.denied', true);

        $this->assertDatabaseMissing('tasks', [
            'title' => 'Unauthorized task attempt',
        ]);
    }

    public function test_tasks_create_rejects_cross_tenant_assignee(): void
    {
        [$company, $admin] = $this->seedCompanyUser('admin');
        [$otherCompany, $otherAgent] = $this->seedCompanyUser('agent');

        $this->assertNotEquals($company->id, $otherCompany->id);

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'create task with assignment',
                'action_confirmed' => true,
                'action_args' => [
                    'title' => 'Cross tenant assignment attempt',
                    'type' => TaskType::INSPECTION->value,
                    'description' => 'This should be blocked because user is from another tenant.',
                    'location' => 'Main Warehouse',
                    'address' => '101 Main Port Road, Lagos',
                    'assigned_agent_id' => $otherAgent->id,
                    'due_date' => now()->addDay()->toIso8601String(),
                ],
            ]);

        $response
            ->assertStatus(422)
            ->assertJsonValidationErrors(['assigned_agent_id']);
    }

    public function test_duplicate_idempotency_key_reuses_first_action_result(): void
    {
        [$company, $admin] = $this->seedCompanyUser('admin');

        $payload = [
            'company_id' => $company->id,
            'message' => 'create task for idempotency verification',
            'action_confirmed' => true,
            'idempotency_key' => 'copilot-action-key-01',
            'action_args' => [
                'title' => 'Idempotent task create',
                'type' => TaskType::INSPECTION->value,
                'description' => 'Ensure duplicate action retries do not create duplicate records.',
                'location' => 'Ops Hub',
                'address' => '77 Coordination Street, Lagos',
                'due_date' => now()->addDay()->toIso8601String(),
            ],
        ];

        $first = $this->actingAs($admin)->postJson('/api/v1/copilot/chat', $payload);
        $first
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'tasks.create')
            ->assertJsonPath('data.response.payload.idempotent_replay', false);

        $second = $this->actingAs($admin)->postJson('/api/v1/copilot/chat', $payload);
        $second
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'tasks.create')
            ->assertJsonPath('data.response.payload.idempotent_replay', true);

        $this->assertSame(1, Task::query()->where('title', 'Idempotent task create')->count());

        $firstTaskId = $first->json('data.response.payload.task_id');
        $secondTaskId = $second->json('data.response.payload.task_id');

        $this->assertSame($firstTaskId, $secondTaskId);
    }

    public function test_action_like_request_without_supported_tool_does_not_claim_execution_success(): void
    {
        [$company, $admin] = $this->seedCompanyUser('admin');

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Delete project Apollo immediately',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', null);

        $content = (string) $response->json('data.response.content');
        $this->assertStringContainsString('write action request', strtolower($content));
        $this->assertStringNotContainsString('successfully', strtolower($content));
    }

    public function test_confirmation_payload_infers_action_args_when_missing(): void
    {
        [$company, $admin] = $this->seedCompanyUser('admin');
        [$sameCompany, $agent] = $this->seedCompanyUser('agent');

        $sameCompany->users()->detach($agent->id);
        $company->users()->attach($agent->id, [
            'role' => 'agent',
            'joined_at' => now(),
        ]);

        $agent->name = 'John Agent';
        $agent->save();

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Create a task for agent John Agent to inspect the depot.',
                'action_confirmed' => false,
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'tasks.create')
            ->assertJsonPath('data.response.payload.confirmation_required', true)
            ->assertJsonPath('data.response.payload.action_args.type', TaskType::INSPECTION->value)
            ->assertJsonPath('data.response.payload.action_args.assigned_agent_id', $agent->id);
    }

    /**
     * @return array{0: Company, 1: User}
     */
    private function seedCompanyUser(string $role): array
    {
        $company = Company::query()->create([
            'company_id' => strtoupper(Str::random(10)),
            'name' => 'Factory ' . Str::upper(Str::random(4)),
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Operations management',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        /** @var User $user */
        $user = User::factory()->createOne();

        $company->users()->attach($user->id, [
            'role' => $role,
            'joined_at' => now(),
        ]);

        return [$company, $user];
    }
}
