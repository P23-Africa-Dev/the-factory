<?php

declare(strict_types=1);

namespace Tests\Feature\Demo;

use App\Enums\SubscriptionStatus;
use App\Enums\TaskPriority;
use App\Enums\TaskStatus;
use App\Enums\TaskType;
use App\Models\AttendanceSetting;
use App\Models\Company;
use App\Models\Task;
use App\Models\User;
use App\Services\AI\Planning\DailyPlanningService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

final class DemoDailyPlanningTest extends TestCase
{
    use RefreshDatabase;

    public function test_demo_plan_my_day_returns_items_with_varied_limit(): void
    {
        [$company, $agent] = $this->seedDemoAgentCompany();

        for ($i = 0; $i < 10; $i++) {
            Task::query()->create([
                'company_id' => $company->id,
                'created_by_user_id' => $agent->id,
                'assigned_agent_id' => $agent->id,
                'last_status_updated_by_user_id' => $agent->id,
                'title' => 'Demo task ' . $i,
                'type' => TaskType::INSPECTION->value,
                'due_at' => now()->addHours($i + 1),
                'priority' => TaskPriority::MEDIUM->value,
                'status' => TaskStatus::PENDING->value,
                'latitude' => 6.5 + ($i * 0.001),
                'longitude' => 3.3 + ($i * 0.001),
            ]);
        }

        $response = $this
            ->actingAs($agent)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Plan my day',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'planning.daily');

        $items = $response->json('data.response.payload.items');
        $this->assertIsArray($items);
        $this->assertGreaterThanOrEqual(5, count($items));
        $this->assertLessThanOrEqual(8, count($items));
        $this->assertArrayHasKey('acceptance', $response->json('data.response.payload'));
    }

    public function test_demo_plan_builder_applies_score_variety(): void
    {
        [$company, $agent] = $this->seedDemoAgentCompany();

        Task::query()->create([
            'company_id' => $company->id,
            'created_by_user_id' => $agent->id,
            'assigned_agent_id' => $agent->id,
            'last_status_updated_by_user_id' => $agent->id,
            'title' => 'Priority visit',
            'type' => TaskType::SALES_VISIT->value,
            'due_at' => now()->addHours(2),
            'priority' => TaskPriority::HIGH->value,
            'status' => TaskStatus::PENDING->value,
            'latitude' => 6.5244,
            'longitude' => 3.3792,
        ]);

        $plan = app(DailyPlanningService::class)->buildPlan($agent, $company->id);

        $items = $plan['payload']['items'] ?? null;
        $this->assertIsArray($items);
        $this->assertNotEmpty($items);
    }

    /**
     * @return array{0: Company, 1: User}
     */
    private function seedDemoAgentCompany(): array
    {
        $company = Company::query()->create([
            'company_id' => 'FAC-DEMO' . strtoupper(Str::random(4)),
            'name' => 'Demo Planning Co',
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

        return [$company, $agent];
    }
}
