<?php

declare(strict_types=1);

namespace Tests\Feature\AI;

use App\Enums\TaskType;
use App\Models\Company;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Str;
use Mockery;
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

    public function test_confirmation_payload_parses_structured_task_prompt_without_oversized_title(): void
    {
        [$company, $admin] = $this->seedCompanyUser('admin');
        [$sameCompany, $agent] = $this->seedCompanyUser('agent');

        $sameCompany->users()->detach($agent->id);
        $company->users()->attach($agent->id, [
            'role' => 'agent',
            'joined_at' => now(),
        ]);

        $agent->name = 'Agent Elijah';
        $agent->email = 'agentelijah@yopmail.com';
        $agent->save();

        $message = 'Create a task for Agent Elijah (email: agentelijah@yopmail.com). Task title: Deliver item to a client at Lekki. Task type: Delivery. Description: Deliver this item to Mr Tony at Lekki. Assign To: Agent Elijah. Location & Address: Km 19 Lekki - Epe Expy, Lekki Penninsula II, Lekki 106104, Lagos. Due Date: 17th of this month.';

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => $message,
                'action_confirmed' => false,
            ]);

        $title = (string) $response->json('data.response.payload.action_args.title');

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'tasks.create')
            ->assertJsonPath('data.response.payload.confirmation_required', true)
            ->assertJsonPath('data.response.payload.action_args.type', TaskType::DELIVERY->value)
            ->assertJsonPath('data.response.payload.action_args.assigned_agent_id', $agent->id)
            ->assertJsonPath('data.response.payload.action_args.location', 'Km 19 Lekki - Epe Expy')
            ->assertJsonPath('data.response.payload.action_args.address', 'Km 19 Lekki - Epe Expy, Lekki Penninsula II, Lekki 106104, Lagos');

        $this->assertSame('Deliver item to a client at Lekki', $title);
        $this->assertLessThanOrEqual(255, mb_strlen($title));
        $this->assertStringContainsString('Click Confirm Action to proceed', (string) $response->json('data.response.content'));
    }

    public function test_confirmation_payload_parses_assign_to_without_colon(): void
    {
        [$company, $admin] = $this->seedCompanyUser('admin');
        [$sameCompany, $agent] = $this->seedCompanyUser('agent');

        $sameCompany->users()->detach($agent->id);
        $company->users()->attach($agent->id, [
            'role' => 'agent',
            'joined_at' => now(),
        ]);

        $agent->name = 'Elijah Stone';
        $agent->save();

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Create a task title: "Deliver package" description: Deliver safely to client in Lekki assign to Elijah Stone due tomorrow evening location & address: Lekki Phase 1, Lagos',
                'action_confirmed' => false,
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'tasks.create')
            ->assertJsonPath('data.response.payload.confirmation_required', true)
            ->assertJsonPath('data.response.payload.action_args.assigned_agent_id', $agent->id)
            ->assertJsonPath('data.response.payload.action_args.title', 'Deliver package');
    }

    public function test_confirmation_payload_parses_due_in_days_phrase(): void
    {
        [$company, $admin] = $this->seedCompanyUser('admin');

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Create task title: Inventory check description: Verify warehouse inventory due in 3 days location: Main warehouse, Lagos',
                'action_confirmed' => false,
            ]);

        $response->assertOk()->assertJsonPath('data.response.tool', 'tasks.create');

        $dueDate = (string) $response->json('data.response.payload.action_args.due_date');
        $this->assertNotSame('', $dueDate);
        $this->assertTrue(str_contains($dueDate, '-'));
    }

    public function test_confirmation_payload_returns_validation_warnings_for_ambiguous_fields(): void
    {
        [$company, $admin] = $this->seedCompanyUser('admin');

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Create task for agent Unknown Person',
                'action_confirmed' => false,
            ]);

        $warnings = $response->json('data.response.payload.validation_warnings');
        $warningCodes = $response->json('data.response.payload.validation_warning_codes');
        $blockingCodes = $response->json('data.response.payload.blocking_warning_codes');

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'tasks.create')
            ->assertJsonPath('data.response.payload.confirmation_required', true)
            ->assertJsonPath('data.response.payload.blocking_confirmation', true);

        $response->assertJsonMissingPath('data.response.payload.action_args.__inference');

        $this->assertIsArray($warnings);
        $this->assertNotEmpty($warnings);
        $this->assertStringContainsString('No matching assignee was found', implode(' ', $warnings));
        $this->assertIsArray($warningCodes);
        $this->assertContains('assignee_unresolved', $warningCodes);
        $this->assertIsArray($blockingCodes);
        $this->assertContains('assignee_unresolved', $blockingCodes);
    }

    public function test_strict_confirmation_blocking_can_require_explicit_title_and_due_date(): void
    {
        Config::set('services.ai.strict_confirmation_blocking', true);
        Config::set('services.ai.strict_confirmation_blocking_codes', ['used_default_title', 'used_default_due_date']);

        [$company, $admin] = $this->seedCompanyUser('admin');
        $this->createCompanyAgent($company, 'Elijah Stone');

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Create task assign to Elijah Stone',
                'action_confirmed' => false,
            ]);

        $blockingCodes = $response->json('data.response.payload.blocking_warning_codes');

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'tasks.create')
            ->assertJsonPath('data.response.payload.confirmation_required', true)
            ->assertJsonPath('data.response.payload.blocking_confirmation', true);

        $this->assertIsArray($blockingCodes);
        $this->assertContains('used_default_title', $blockingCodes);
        $this->assertContains('used_default_due_date', $blockingCodes);
    }

    public function test_set_task_for_assignee_returns_confirmation_payload(): void
    {
        [$company, $admin] = $this->seedCompanyUser('admin');
        $kelvin = $this->createCompanyAgent($company, 'Kelvin Hart', 'kelvin.hart@example.com');

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'set a task for kelvin to visit shoprite',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'tasks.create')
            ->assertJsonPath('data.response.payload.confirmation_required', true)
            ->assertJsonPath('data.response.payload.action_args.assigned_agent_id', $kelvin->id);

        $title = (string) $response->json('data.response.payload.action_args.title');
        $this->assertStringContainsString('shoprite', strtolower($title));

        $content = strtolower((string) $response->json('data.response.content'));
        $this->assertStringNotContainsString('task created successfully', $content);
        $this->assertStringNotContainsString('executing task creation', $content);
    }

    public function test_multi_turn_task_conversation_creates_task_on_go_ahead(): void
    {
        [$company, $admin] = $this->seedCompanyUser('admin');
        $kelvin = $this->createCompanyAgent($company, 'Kelvin Hart', 'kelvin.hart@example.com');

        $mockRouter = Mockery::mock(\App\Services\AI\Providers\AiProviderRouter::class);
        $mockRouter
            ->shouldReceive('routingMetadata')
            ->andReturn([
                'provider' => 'openai',
                'model' => 'gpt-4.1-mini',
                'purpose' => 'operational',
            ]);
        $mockRouter
            ->shouldReceive('generateForPurpose')
            ->andReturn(\Tests\Support\AiGenerationTestFactory::result('Visit Shoprite, engage store contacts, document observations, and log the visit outcome in CRM.'));
        $this->app->instance(\App\Services\AI\Providers\AiProviderRouter::class, $mockRouter);

        $first = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'set a task for kelvin to visit shoprite',
            ]);

        $threadId = (string) $first->json('data.thread_id');
        $this->assertNotSame('', $threadId);

        $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'thread_id' => $threadId,
                'message' => 'he should do it tomorrow',
            ])
            ->assertOk();

        $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'thread_id' => $threadId,
                'message' => 'priority is medium, description, generate something cool and relative',
            ])
            ->assertOk();

        $final = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'thread_id' => $threadId,
                'message' => 'go ahead',
            ]);

        $final
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'tasks.create')
            ->assertJsonPath('data.response.sources.0', 'tasks.create');

        $this->assertDatabaseHas('tasks', [
            'company_id' => $company->id,
            'assigned_agent_id' => $kelvin->id,
        ]);

        $content = strtolower((string) $final->json('data.response.content'));
        $this->assertStringContainsString('created successfully', $content);
        $this->assertStringNotContainsString('executing task creation through', $content);
    }

    public function test_management_role_can_execute_kpis_create_action(): void
    {
        [$company, $owner] = $this->seedCompanyUser('owner');
        $agent = $this->createCompanyAgent($company, 'John Wick', 'john.wick@example.com');

        $response = $this
            ->actingAs($owner)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Create KPI for retailer visits',
                'action_confirmed' => true,
                'action_args' => [
                    'name' => 'Retailer Visit Target',
                    'category' => 'customer_visits',
                    'objective' => 'Increase qualified retailer visits across the assigned territory.',
                    'target_value' => '50 visits',
                    'expected_outcome' => 'Reach 50 qualified retailer visits within the KPI period.',
                    'start_date' => now()->toDateString(),
                    'end_date' => now()->addMonth()->toDateString(),
                    'priority' => 'high',
                    'assigned_to_user_id' => $agent->id,
                ],
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'kpis.create')
            ->assertJsonPath('data.response.sources.0', 'kpis.create');

        $this->assertDatabaseHas('kpis', [
            'company_id' => $company->id,
            'name' => 'Retailer Visit Target',
            'assigned_to_user_id' => $agent->id,
        ]);
    }

    public function test_agent_is_denied_from_kpis_create_action(): void
    {
        [$company, $agent] = $this->seedCompanyUser('agent');

        $response = $this
            ->actingAs($agent)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'create kpi now',
                'action_confirmed' => true,
                'action_args' => [
                    'name' => 'Unauthorized KPI',
                    'category' => 'sales',
                    'objective' => 'Agent should not be able to create this KPI record.',
                    'target_value' => '10 sales',
                    'expected_outcome' => 'This KPI creation should be denied by policy.',
                    'start_date' => now()->toDateString(),
                    'end_date' => now()->addMonth()->toDateString(),
                    'priority' => 'medium',
                ],
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'kpis.create')
            ->assertJsonPath('data.response.payload.denied', true);

        $this->assertDatabaseMissing('kpis', [
            'name' => 'Unauthorized KPI',
        ]);
    }

    public function test_kpis_create_confirmation_payload_parses_labeled_message(): void
    {
        [$company, $owner] = $this->seedCompanyUser('owner');
        $agent = $this->createCompanyAgent($company, 'John Wick', 'john.wick@example.com');

        $response = $this
            ->actingAs($owner)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Create KPI. KPI name: Retail Visits. Objective: Increase qualified retailer visits in Lagos. Target value: 50 visits. Expected outcome: Reach 50 qualified retailer sign-ups this month. Priority: high. Assign to: John Wick',
                'action_confirmed' => false,
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'kpis.create')
            ->assertJsonPath('data.response.payload.confirmation_required', true)
            ->assertJsonPath('data.response.payload.action_args.name', 'Retail Visits')
            ->assertJsonPath('data.response.payload.action_args.target_value', '50 visits')
            ->assertJsonPath('data.response.payload.action_args.assigned_to_user_id', $agent->id);
    }

    public function test_confirmed_action_can_resolve_assignee_from_inline_edit_field(): void
    {
        [$company, $admin] = $this->seedCompanyUser('admin');
        $agent = $this->createCompanyAgent($company, 'Elijah Stone', 'elijah.stone@example.com');

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Create task now',
                'action_confirmed' => true,
                'action_args' => [
                    'title' => 'Delivery route handoff',
                    'type' => 'delivery',
                    'description' => 'Hand off shipment route plan to the assigned field agent.',
                    'location' => 'Lekki Hub',
                    'address' => '12 Admiralty Way, Lekki, Lagos',
                    'due_date' => 'tomorrow evening',
                    'assignee' => $agent->email,
                ],
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'tasks.create');

        $this->assertDatabaseHas('tasks', [
            'company_id' => $company->id,
            'title' => 'Delivery route handoff',
            'assigned_agent_id' => $agent->id,
        ]);
    }

    public function test_org_users_create_confirmation_payload_autofills_from_prompt(): void
    {
        [$company, $owner] = $this->seedCompanyUser('owner');
        $company->update([
            'subscription_status' => 'active',
            'subscription_plan_key' => 'up_to_50',
            'subscription_billing_interval' => 'monthly',
            'subscription_current_period_start' => now(),
            'subscription_current_period_end' => now()->addMonth(),
        ]);
        $supervisor = $this->createCompanyAgent($company, 'John Supervisor', 'john.supervisor@example.com');
        $company->users()->syncWithoutDetaching([
            $supervisor->id => ['role' => 'supervisor', 'joined_at' => now()],
        ]);

        $response = $this
            ->actingAs($owner)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Create me a new agent with name Ella Star, email ella.star@example.com under John Supervisor',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'org.users.create')
            ->assertJsonPath('data.response.payload.confirmation_required', true)
            ->assertJsonPath('data.response.payload.action_args.full_name', 'Ella Star')
            ->assertJsonPath('data.response.payload.action_args.email', 'ella.star@example.com')
            ->assertJsonPath('data.response.payload.action_args.role', 'agent');
    }

    public function test_management_role_can_execute_org_users_create_action(): void
    {
        [$company, $owner] = $this->seedCompanyUser('owner');
        $company->update([
            'subscription_status' => 'active',
            'subscription_plan_key' => 'up_to_50',
            'subscription_billing_interval' => 'monthly',
            'subscription_current_period_start' => now(),
            'subscription_current_period_end' => now()->addMonth(),
        ]);
        $supervisor = $this->createCompanyAgent($company, 'Jane Supervisor', 'jane.supervisor@example.com');
        $company->users()->syncWithoutDetaching([
            $supervisor->id => ['role' => 'supervisor', 'joined_at' => now()],
        ]);

        $response = $this
            ->actingAs($owner)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Create new agent',
                'action_confirmed' => true,
                'action_args' => [
                    'full_name' => 'Ella Stark',
                    'email' => 'ella.stark@example.com',
                    'role' => 'agent',
                    'assigned_zone' => 'Island',
                    'work_days' => ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
                    'base_salary' => 0,
                    'salary_type' => 'monthly',
                    'commission_enabled' => false,
                    'supervisor_user_id' => $supervisor->id,
                ],
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'org.users.create')
            ->assertJsonPath('data.response.sources.0', 'org.users.create');

        $this->assertDatabaseHas('users', [
            'name' => 'Ella Stark',
            'email' => 'ella.stark@example.com',
            'internal_role' => 'agent',
        ]);
    }

    private function createCompanyAgent(Company $company, string $name, ?string $email = null): User
    {
        /** @var User $agent */
        $agent = User::factory()->createOne([
            'name' => $name,
            'email' => $email ?? Str::slug($name, '.') . '@example.com',
        ]);

        $company->users()->attach($agent->id, [
            'role' => 'agent',
            'joined_at' => now(),
        ]);

        return $agent;
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
