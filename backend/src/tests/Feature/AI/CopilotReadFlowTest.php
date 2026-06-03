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

final class CopilotReadFlowTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_get_overdue_tasks_summary_and_thread_is_persisted(): void
    {
        [$company, $admin] = $this->seedCompanyAdmin();

        Task::query()->create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'assigned_agent_id' => null,
            'last_status_updated_by_user_id' => $admin->id,
            'title' => 'Expired compliance submission',
            'type' => TaskType::INSPECTION->value,
            'description' => 'Upload compliance document package for Q2 audit.',
            'location_text' => 'HQ office',
            'address_full' => '15 Marina Road, Lagos',
            'due_at' => now()->subDay(),
            'priority' => TaskPriority::HIGH->value,
            'status' => TaskStatus::PENDING->value,
        ]);

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Show me overdue tasks right now',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'tasks.overdue')
            ->assertJsonPath('data.response.sources.0', 'tasks.overdue')
            ->assertJsonPath('data.thread_id', $response->json('data.thread_id'));

        $this
            ->actingAs($admin)
            ->getJson('/api/v1/copilot/threads?company_id=' . $company->id)
            ->assertOk()
            ->assertJsonCount(1, 'data.items');

        $this
            ->actingAs($admin)
            ->getJson('/api/v1/copilot/threads/' . $response->json('data.thread_id') . '?company_id=' . $company->id)
            ->assertOk()
            ->assertJsonCount(2, 'data.thread.messages');
    }

    /**
     * @return array{0: Company, 1: User}
     */
    private function seedCompanyAdmin(): array
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
        $admin = User::factory()->createOne();

        $company->users()->attach($admin->id, [
            'role' => 'admin',
            'joined_at' => now(),
        ]);

        return [$company, $admin];
    }
}
