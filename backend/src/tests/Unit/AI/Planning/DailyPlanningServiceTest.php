<?php

declare(strict_types=1);

namespace Tests\Unit\AI\Planning;

use App\Enums\LeadPriority;
use App\Enums\TaskPriority;
use App\Enums\TaskStatus;
use App\Enums\TaskType;
use App\Models\Company;
use App\Models\CompanyLocation;
use App\Models\Lead;
use App\Models\LeadPipeline;
use App\Models\Task;
use App\Models\User;
use App\Services\AI\Planning\DailyPlanningService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

final class DailyPlanningServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_overdue_task_ranks_above_stale_follow_up(): void
    {
        [$company, $agent, $pipelineId] = $this->seedAgentCompany();

        Task::query()->create([
            'company_id' => $company->id,
            'created_by_user_id' => $agent->id,
            'assigned_agent_id' => $agent->id,
            'last_status_updated_by_user_id' => $agent->id,
            'title' => 'Overdue compliance visit',
            'type' => TaskType::SALES_VISIT->value,
            'due_at' => now()->subDay(),
            'priority' => TaskPriority::HIGH->value,
            'status' => TaskStatus::PENDING->value,
        ]);

        Lead::query()->create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $agent->id,
            'assigned_to_user_id' => $agent->id,
            'name' => 'Stale Prospect',
            'status' => 'contacted',
            'priority' => LeadPriority::MEDIUM->value,
            'last_interaction_at' => now()->subDays(20),
        ]);

        $service = app(DailyPlanningService::class);
        $result = $service->buildPlan($agent, $company->id);

        $this->assertSame('planning.daily', $result['tool']);
        $items = $result['payload']['items'];
        $this->assertNotEmpty($items);
        $this->assertSame('overdue_task', $items[0]['type']);
    }

    public function test_nearby_location_boosts_score_when_coordinates_provided(): void
    {
        [$company, $agent, $pipelineId] = $this->seedAgentCompany();

        $location = CompanyLocation::query()->create([
            'company_id' => $company->id,
            'created_by_user_id' => $agent->id,
            'name' => 'Corner Shop',
            'latitude' => 6.4401,
            'longitude' => 3.4501,
            'is_active' => true,
        ]);

        Lead::query()->create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'company_location_id' => $location->id,
            'created_by_user_id' => $agent->id,
            'assigned_to_user_id' => $agent->id,
            'name' => 'Nearby Lead',
            'status' => 'contacted',
            'priority' => LeadPriority::HIGH->value,
            'last_interaction_at' => now()->subDays(21),
        ]);

        $service = app(DailyPlanningService::class);
        $result = $service->buildPlan($agent, $company->id, [
            'latitude' => 6.4400,
            'longitude' => 3.4500,
        ]);

        $nearbyItems = array_values(array_filter(
            $result['payload']['items'],
            static fn(array $item): bool => $item['type'] === 'nearby_visit' || $item['entity_type'] === 'lead',
        ));

        $this->assertNotEmpty($nearbyItems);
        $this->assertNotNull($nearbyItems[0]['distance_km']);
        $this->assertLessThan(2.0, (float) $nearbyItems[0]['distance_km']);
    }

    /**
     * @return array{0: Company, 1: User, 2: int}
     */
    private function seedAgentCompany(): array
    {
        $company = Company::query()->create([
            'company_id' => strtoupper(Str::random(10)),
            'name' => 'Planning Co ' . Str::upper(Str::random(4)),
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
}
