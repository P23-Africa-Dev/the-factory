<?php

declare(strict_types=1);

namespace Tests\Feature\AI;

use App\Enums\TaskPriority;
use App\Enums\TaskStatus;
use App\Enums\TaskType;
use App\Models\Company;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

final class CopilotListDisclosureTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'services.ai.enable_read_synthesis' => false,
            'services.ai.enable_hybrid_router' => false,
        ]);
    }

    public function test_fifteen_overdue_tasks_shows_preview_with_accurate_total(): void
    {
        [$company, $admin] = $this->seedCompanyAdmin();

        for ($i = 1; $i <= 15; $i++) {
            Task::query()->create([
                'company_id' => $company->id,
                'created_by_user_id' => $admin->id,
                'assigned_agent_id' => null,
                'last_status_updated_by_user_id' => $admin->id,
                'title' => 'Overdue task ' . $i,
                'type' => TaskType::INSPECTION->value,
                'description' => 'Task ' . $i,
                'location_text' => 'HQ office',
                'address_full' => '15 Marina Road, Lagos',
                'due_at' => now()->subDays($i),
                'priority' => TaskPriority::HIGH->value,
                'status' => TaskStatus::PENDING->value,
            ]);
        }

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Show overdue tasks',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'tasks.overdue');

        $payload = $response->json('data.response.payload');
        $this->assertIsArray($payload);
        $this->assertSame(15, $payload['total'] ?? null);
        $this->assertLessThanOrEqual(10, $payload['count'] ?? 0);
        $this->assertTrue($payload['truncated'] ?? false);
        $this->assertSame(5, $payload['remaining_count'] ?? null);

        $summary = (string) $response->json('data.response.content');
        $this->assertStringContainsString('15', $summary);
        $this->assertStringContainsString('Would you like me to list all of them?', $summary);
    }

    public function test_yes_list_them_all_expands_after_truncated_preview(): void
    {
        [$company, $admin] = $this->seedCompanyAdmin();

        for ($i = 1; $i <= 15; $i++) {
            Task::query()->create([
                'company_id' => $company->id,
                'created_by_user_id' => $admin->id,
                'assigned_agent_id' => null,
                'last_status_updated_by_user_id' => $admin->id,
                'title' => 'Overdue task ' . $i,
                'type' => TaskType::INSPECTION->value,
                'description' => 'Task ' . $i,
                'location_text' => 'HQ office',
                'address_full' => '15 Marina Road, Lagos',
                'due_at' => now()->subDays($i),
                'priority' => TaskPriority::HIGH->value,
                'status' => TaskStatus::PENDING->value,
            ]);
        }

        $first = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Show overdue tasks',
            ]);

        $first->assertOk();
        $threadId = (string) $first->json('data.thread_id');
        $this->assertNotSame('', $threadId);

        $second = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'thread_id' => $threadId,
                'message' => 'Yes, list them all',
            ]);

        $second
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'tasks.overdue');

        $payload = $second->json('data.response.payload');
        $this->assertIsArray($payload);
        $this->assertSame(15, $payload['total'] ?? null);
        $this->assertSame(15, $payload['count'] ?? null);
        $this->assertFalse($payload['truncated'] ?? true);
        $this->assertSame(0, $payload['remaining_count'] ?? null);
    }

    /**
     * @return array{0: Company, 1: User}
     */
    private function seedCompanyAdmin(): array
    {
        $company = Company::query()->create([
            'company_id' => strtoupper(Str::random(10)),
            'name' => 'Factory List Disclosure',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Operations management',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $admin = User::factory()->createOne(['is_active' => true]);
        $company->users()->attach($admin->id, ['role' => 'admin', 'joined_at' => now()]);

        return [$company, $admin];
    }
}
