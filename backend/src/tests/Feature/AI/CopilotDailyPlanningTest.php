<?php

declare(strict_types=1);

namespace Tests\Feature\AI;

use App\Enums\KpiCategory;
use App\Enums\KpiPriority;
use App\Enums\KpiStatus;
use App\Enums\LeadPriority;
use App\Enums\TaskPriority;
use App\Enums\TaskStatus;
use App\Enums\TaskType;
use App\Models\AttendanceSetting;
use App\Models\Company;
use App\Models\Kpi;
use App\Models\Lead;
use App\Models\LeadPipeline;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

final class CopilotDailyPlanningTest extends TestCase
{
    use RefreshDatabase;

    public function test_plan_my_day_routes_to_planning_daily_tool(): void
    {
        [$company, $agent, $pipelineId] = $this->seedAgentCompany();

        Task::query()->create([
            'company_id' => $company->id,
            'created_by_user_id' => $agent->id,
            'assigned_agent_id' => $agent->id,
            'last_status_updated_by_user_id' => $agent->id,
            'title' => 'Due today inspection',
            'type' => TaskType::INSPECTION->value,
            'due_at' => now()->addHours(3),
            'priority' => TaskPriority::MEDIUM->value,
            'status' => TaskStatus::PENDING->value,
        ]);

        $response = $this
            ->actingAs($agent)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Plan my day',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'planning.daily')
            ->assertJsonPath('data.response.sources.0', 'planning.daily');

        $items = $response->json('data.response.payload.items');
        $this->assertIsArray($items);
        $this->assertNotEmpty($items);
        $this->assertArrayHasKey('task_draft', $items[0]);
        $this->assertArrayHasKey('scheduled_start', $items[0]);
        $this->assertArrayHasKey('acceptance', $response->json('data.response.payload'));
    }

    public function test_copilot_plan_payload_can_be_accepted_to_create_tasks(): void
    {
        [$company, $agent, $pipelineId] = $this->seedAgentCompany();

        Lead::query()->create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $agent->id,
            'assigned_to_user_id' => $agent->id,
            'name' => 'Acme Corp',
            'status' => 'contacted',
            'priority' => LeadPriority::HIGH->value,
            'last_interaction_at' => now()->subDays(21),
        ]);

        $planResponse = $this
            ->actingAs($agent)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Plan my day',
            ]);

        $planResponse->assertOk();

        $payload = $planResponse->json('data.response.payload');
        $this->assertIsArray($payload);

        $items = $payload['items'] ?? [];
        $this->assertNotEmpty($items);

        $drafts = array_values(array_map(
            static fn (array $item): array => $item['task_draft'],
            $items,
        ));

        $acceptResponse = $this
            ->actingAs($agent)
            ->postJson('/api/v1/agent/planning/accept', [
                'company_id' => $company->id,
                'plan_date' => $payload['plan_date'] ?? now()->toDateString(),
                'items' => $drafts,
            ]);

        $acceptResponse
            ->assertCreated()
            ->assertJsonPath('data.linked_existing', fn (mixed $value): bool => is_int($value) || is_numeric($value));

        $created = $acceptResponse->json('data.created');
        $this->assertIsArray($created);

        $creatableCount = count(array_filter(
            $drafts,
            static fn (array $draft): bool => ($draft['creates_task'] ?? false) === true,
        ));

        if ($creatableCount > 0) {
            $this->assertNotEmpty($created);
            $this->assertDatabaseHas('tasks', [
                'company_id' => $company->id,
                'assigned_agent_id' => $agent->id,
            ]);
        }
    }

    public function test_accept_accepts_plan_drafts_with_empty_location_strings(): void
    {
        [$company, $agent] = $this->seedAgentCompany();
        $dedupeKey = hash('sha256', 'meeting:1:' . now()->toDateString());

        $this
            ->actingAs($agent)
            ->postJson('/api/v1/agent/planning/accept', [
                'company_id' => $company->id,
                'plan_date' => now()->toDateString(),
                'items' => [
                    [
                        'creates_task' => true,
                        'dedupe_key' => $dedupeKey,
                        'title' => 'Prepare for: Team standup',
                        'type' => TaskType::AWARENESS->value,
                        'description' => 'Prepare talking points for Team standup. [plan:' . $dedupeKey . ']',
                        'due_date' => now()->addHours(2)->toIso8601String(),
                        'priority' => TaskPriority::HIGH->value,
                        'location' => '',
                    ],
                ],
            ])
            ->assertCreated()
            ->assertJsonPath('data.skipped', 0);
    }

    public function test_plan_includes_kpi_items_with_task_drafts(): void
    {
        [$company, $agent, $pipelineId] = $this->seedAgentCompany();

        Kpi::create([
            'company_id' => $company->id,
            'created_by_user_id' => $agent->id,
            'assigned_to_user_id' => $agent->id,
            'name' => 'Retail Visits',
            'category' => KpiCategory::CUSTOMER_VISITS->value,
            'objective' => 'Complete 20 retail visits this month',
            'target_value' => '20',
            'expected_outcome' => 'Higher store coverage',
            'priority' => KpiPriority::HIGH->value,
            'status' => KpiStatus::IN_PROGRESS->value,
            'start_date' => now()->subDays(5)->toDateString(),
            'end_date' => now()->addDays(10)->toDateString(),
        ]);

        $response = $this
            ->actingAs($agent)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Plan my day',
            ]);

        $response->assertOk();

        $items = $response->json('data.response.payload.items') ?? [];
        $kpiItems = array_values(array_filter($items, static fn(array $item): bool => ($item['type'] ?? '') === 'kpi'));

        $this->assertNotEmpty($kpiItems);
        $this->assertTrue($kpiItems[0]['task_draft']['creates_task'] ?? false);
    }

    public function test_plan_ready_notification_is_created(): void
    {
        [$company, $agent, $pipelineId] = $this->seedAgentCompany();

        $this
            ->actingAs($agent)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Plan my day',
            ])
            ->assertOk();

        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $agent->id,
            'type' => 'daily_plan.ready',
            'title' => 'Your daily plan is ready',
        ]);
    }

    public function test_agent_plan_excludes_other_agents_leads(): void
    {
        [$company, $agent, $otherAgent, $pipelineId] = $this->seedTwoAgents();

        Lead::query()->create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $otherAgent->id,
            'assigned_to_user_id' => $otherAgent->id,
            'name' => 'Other Agent Lead',
            'status' => 'contacted',
            'priority' => LeadPriority::URGENT->value,
            'last_interaction_at' => now()->subDays(30),
        ]);

        Lead::query()->create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $agent->id,
            'assigned_to_user_id' => $agent->id,
            'name' => 'My Lead',
            'status' => 'contacted',
            'priority' => LeadPriority::HIGH->value,
            'last_interaction_at' => now()->subDays(30),
        ]);

        $response = $this
            ->actingAs($agent)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Plan my day',
            ]);

        $response->assertOk();

        $items = $response->json('data.response.payload.items') ?? [];
        $titles = array_map(static fn(array $item): string => (string) ($item['title'] ?? ''), $items);

        $this->assertContains('Follow up: My Lead', $titles);
        $this->assertNotContains('Follow up: Other Agent Lead', $titles);
    }

    public function test_context_coordinates_set_agent_location_available(): void
    {
        [$company, $agent] = $this->seedAgentCompany();

        $response = $this
            ->actingAs($agent)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Show nearby opportunities',
                'context' => [
                    'latitude' => 6.44,
                    'longitude' => 3.45,
                ],
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'planning.daily')
            ->assertJsonPath('data.response.payload.agent_location_available', true);
    }

    public function test_follow_up_summary_routes_to_crm_tool(): void
    {
        [$company, $agent, $pipelineId] = $this->seedAgentCompany();

        Lead::query()->create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $agent->id,
            'assigned_to_user_id' => $agent->id,
            'name' => 'Follow Up Lead',
            'status' => 'contacted',
            'priority' => LeadPriority::HIGH->value,
            'last_interaction_at' => now()->subDays(21),
        ]);

        $response = $this
            ->actingAs($agent)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Give me a CRM follow-up summary',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'crm.follow_up_summary');
    }

    /**
     * @return array{0: Company, 1: User, 2: int}
     */
    private function seedAgentCompany(): array
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

        /** @var User $agent */
        $agent = User::factory()->createOne(['internal_role' => 'agent']);

        $company->users()->attach($agent->id, [
            'role' => 'agent',
            'joined_at' => now(),
        ]);

        AttendanceSetting::query()->create([
            'company_id' => $company->id,
            'opening_time' => '09:00:00',
            'closing_time' => '17:00:00',
            'working_days' => ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
            'clockin_window_minutes' => 15,
            'auto_clockout_enabled' => true,
        ]);

        $pipelineId = LeadPipeline::query()->create([
            'company_id' => $company->id,
            'name' => 'Default',
            'slug' => 'default',
            'is_default' => true,
        ])->id;

        return [$company, $agent, $pipelineId];
    }

    /**
     * @return array{0: Company, 1: User, 2: User, 3: int}
     */
    private function seedTwoAgents(): array
    {
        [$company, $agent, $pipelineId] = $this->seedAgentCompany();

        /** @var User $otherAgent */
        $otherAgent = User::factory()->createOne(['internal_role' => 'agent']);
        $company->users()->attach($otherAgent->id, [
            'role' => 'agent',
            'joined_at' => now(),
        ]);

        return [$company, $agent, $otherAgent, $pipelineId];
    }
}
