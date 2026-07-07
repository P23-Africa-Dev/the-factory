<?php

declare(strict_types=1);

namespace Tests\Feature\Agent;

use App\Enums\KpiCategory;
use App\Enums\KpiPriority;
use App\Enums\KpiStatus;
use App\Enums\LeadPriority;
use App\Enums\TaskPriority;
use App\Enums\TaskStatus;
use App\Enums\TaskType;
use App\Models\AppNotification;
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

final class AgentPlanningAcceptTest extends TestCase
{
    use RefreshDatabase;

    public function test_accept_creates_self_tasks_for_creatable_plan_items(): void
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

        $dedupeKey = hash('sha256', 'lead:1:' . now()->toDateString());

        $response = $this
            ->actingAs($agent)
            ->postJson('/api/v1/agent/planning/accept', [
                'company_id' => $company->id,
                'plan_date' => now()->toDateString(),
                'items' => [
                    [
                        'creates_task' => true,
                        'dedupe_key' => $dedupeKey,
                        'title' => 'Follow up: Acme Corp',
                        'type' => TaskType::SALES_VISIT->value,
                        'description' => 'Planned follow-up for Acme Corp. Call to re-engage. [plan:' . $dedupeKey . ']',
                        'due_date' => now()->endOfDay()->toIso8601String(),
                        'priority' => TaskPriority::MEDIUM->value,
                    ],
                ],
            ]);

        $response
            ->assertCreated()
            ->assertJsonPath('data.skipped', 0)
            ->assertJsonPath('data.linked_existing', 0);

        $created = $response->json('data.created');
        $this->assertIsArray($created);
        $this->assertCount(1, $created);

        $this->assertDatabaseHas('tasks', [
            'company_id' => $company->id,
            'assigned_agent_id' => $agent->id,
            'title' => 'Follow up: Acme Corp',
        ]);
    }

    public function test_accept_skips_non_creatable_items(): void
    {
        [$company, $agent] = $this->seedAgentCompany();

        $existingTask = Task::query()->create([
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
            ->postJson('/api/v1/agent/planning/accept', [
                'company_id' => $company->id,
                'plan_date' => now()->toDateString(),
                'items' => [
                    [
                        'creates_task' => false,
                        'linked_task_id' => $existingTask->id,
                        'title' => 'Due today inspection',
                        'type' => TaskType::INSPECTION->value,
                        'description' => 'Existing task in your plan.',
                        'due_date' => now()->addHours(3)->toIso8601String(),
                        'priority' => TaskPriority::MEDIUM->value,
                    ],
                ],
            ]);

        $response
            ->assertCreated()
            ->assertJsonPath('data.linked_existing', 1);

        $created = $response->json('data.created');
        $this->assertIsArray($created);
        $this->assertCount(0, $created);
    }

    public function test_reaccept_is_idempotent_for_same_dedupe_key(): void
    {
        [$company, $agent] = $this->seedAgentCompany();
        $dedupeKey = 'test-dedupe-key-abc';

        $payload = [
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
                ],
            ],
        ];

        $first = $this->actingAs($agent)->postJson('/api/v1/agent/planning/accept', $payload);
        $first->assertCreated()->assertJsonPath('data.skipped', 0);

        $second = $this->actingAs($agent)->postJson('/api/v1/agent/planning/accept', $payload);
        $second
            ->assertCreated()
            ->assertJsonPath('data.skipped', 1);

        $this->assertSame(1, Task::query()
            ->where('assigned_agent_id', $agent->id)
            ->where('title', 'Prepare for: Team standup')
            ->count());
    }

    public function test_accept_sends_notification(): void
    {
        [$company, $agent] = $this->seedAgentCompany();
        $dedupeKey = 'notify-dedupe-key';

        $this->actingAs($agent)->postJson('/api/v1/agent/planning/accept', [
            'company_id' => $company->id,
            'plan_date' => now()->toDateString(),
            'items' => [
                [
                    'creates_task' => true,
                    'dedupe_key' => $dedupeKey,
                    'title' => 'Work on KPI: Retail visits',
                    'type' => TaskType::SALES_VISIT->value,
                    'description' => 'Advance progress on KPI target for retail visits. [plan:' . $dedupeKey . ']',
                    'due_date' => now()->endOfDay()->toIso8601String(),
                    'priority' => TaskPriority::MEDIUM->value,
                ],
            ],
        ])->assertCreated();

        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $agent->id,
            'type' => 'daily_plan.accepted',
            'title' => 'Daily plan activated',
        ]);
    }

    public function test_accept_accepts_modified_draft_subset(): void
    {
        [$company, $agent] = $this->seedAgentCompany();
        $dedupeKeyOne = 'subset-dedupe-one';
        $dedupeKeyTwo = 'subset-dedupe-two';

        $response = $this
            ->actingAs($agent)
            ->postJson('/api/v1/agent/planning/accept', [
                'company_id' => $company->id,
                'plan_date' => now()->toDateString(),
                'items' => [
                    [
                        'creates_task' => true,
                        'dedupe_key' => $dedupeKeyOne,
                        'title' => 'Custom follow up title',
                        'type' => TaskType::SALES_VISIT->value,
                        'description' => 'Modified follow-up description for today. [plan:' . $dedupeKeyOne . ']',
                        'due_date' => now()->endOfDay()->toIso8601String(),
                        'priority' => TaskPriority::HIGH->value,
                    ],
                ],
            ]);

        $response
            ->assertCreated()
            ->assertJsonPath('data.skipped', 0);

        $created = $response->json('data.created');
        $this->assertCount(1, $created);

        $this->assertDatabaseHas('tasks', [
            'company_id' => $company->id,
            'assigned_agent_id' => $agent->id,
            'title' => 'Custom follow up title',
            'priority' => TaskPriority::HIGH->value,
        ]);

        $this->assertDatabaseMissing('tasks', [
            'company_id' => $company->id,
            'assigned_agent_id' => $agent->id,
            'description' => '%' . $dedupeKeyTwo . '%',
        ]);
    }

    public function test_accept_skips_removed_items_when_subset_sent(): void
    {
        [$company, $agent] = $this->seedAgentCompany();
        $dedupeKey = 'removed-item-dedupe';

        $this
            ->actingAs($agent)
            ->postJson('/api/v1/agent/planning/accept', [
                'company_id' => $company->id,
                'plan_date' => now()->toDateString(),
                'items' => [
                    [
                        'creates_task' => true,
                        'dedupe_key' => $dedupeKey,
                        'title' => 'Only selected plan item',
                        'type' => TaskType::SALES_VISIT->value,
                        'description' => 'This is the only item the agent kept in the plan. [plan:' . $dedupeKey . ']',
                        'due_date' => now()->endOfDay()->toIso8601String(),
                        'priority' => TaskPriority::MEDIUM->value,
                    ],
                ],
            ])
            ->assertCreated()
            ->assertJsonPath('data.skipped', 0);

        $this->assertSame(1, Task::query()
            ->where('assigned_agent_id', $agent->id)
            ->where('title', 'Only selected plan item')
            ->count());
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
}
