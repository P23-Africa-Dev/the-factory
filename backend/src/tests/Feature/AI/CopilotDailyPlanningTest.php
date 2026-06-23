<?php

declare(strict_types=1);

namespace Tests\Feature\AI;

use App\Enums\LeadPriority;
use App\Enums\TaskPriority;
use App\Enums\TaskStatus;
use App\Enums\TaskType;
use App\Models\Company;
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
                'message' => 'What follow-ups are due today?',
            ]);

        $response->assertOk();

        $items = $response->json('data.response.payload.items') ?? [];
        $titles = array_map(static fn(array $item): string => (string) ($item['title'] ?? ''), $items);

        $this->assertContains('Follow up: My Lead', $titles);
        $this->assertNotContains('Follow up: Other Agent Lead', $titles);
    }

    public function test_context_coordinates_are_accepted(): void
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
            ->assertJsonPath('data.response.tool', 'planning.daily');
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
