<?php

declare(strict_types=1);

namespace Tests\Feature\Demo;

use App\Enums\LeadPriority;
use App\Enums\SubscriptionStatus;
use App\Enums\TaskPriority;
use App\Enums\TaskType;
use App\Models\AttendanceSetting;
use App\Models\Company;
use App\Models\Lead;
use App\Models\LeadPipeline;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

final class DemoPlanAcceptTest extends TestCase
{
    use RefreshDatabase;

    public function test_demo_org_plan_accept_creates_tasks(): void
    {
        [$company, $agent, $pipelineId] = $this->seedDemoAgentCompany();

        Lead::query()->create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $agent->id,
            'assigned_to_user_id' => $agent->id,
            'name' => 'Demo Lead Ltd',
            'status' => 'contacted',
            'priority' => LeadPriority::HIGH->value,
            'last_interaction_at' => now()->subDays(10),
        ]);

        $dedupeKey = hash('sha256', 'lead:demo:' . now()->toDateString());

        $response = $this
            ->actingAs($agent)
            ->postJson('/api/v1/agent/planning/accept', [
                'company_id' => $company->id,
                'plan_date' => now()->toDateString(),
                'items' => [
                    [
                        'creates_task' => true,
                        'dedupe_key' => $dedupeKey,
                        'title' => 'Follow up: Demo Lead Ltd',
                        'type' => TaskType::SALES_VISIT->value,
                        'description' => 'Planned follow-up. [plan:' . $dedupeKey . ']',
                        'due_date' => now()->endOfDay()->toIso8601String(),
                        'priority' => TaskPriority::MEDIUM->value,
                    ],
                ],
            ]);

        $response
            ->assertCreated()
            ->assertJsonPath('data.created.0.title', 'Follow up: Demo Lead Ltd');

        $this->assertDatabaseHas('tasks', [
            'company_id' => $company->id,
            'assigned_agent_id' => $agent->id,
            'title' => 'Follow up: Demo Lead Ltd',
        ]);
    }

    /**
     * @return array{0: Company, 1: User, 2: int}
     */
    private function seedDemoAgentCompany(): array
    {
        $company = Company::query()->create([
            'company_id' => 'FAC-DEMO' . strtoupper(Str::random(4)),
            'name' => 'Demo Accept Co',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'demo',
            'status' => 'active',
            'activated_at' => now(),
            'is_demo' => true,
            'subscription_status' => SubscriptionStatus::GRACE->value,
            'subscription_grace_ends_at' => '2099-12-31 23:59:59',
        ]);

        $agent = User::factory()->createOne(['internal_role' => 'agent']);
        $company->users()->attach($agent->id, ['role' => 'agent', 'joined_at' => now()]);

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
