<?php

declare(strict_types=1);

namespace Tests\Feature\AI;

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

    public function test_yes_please_expands_truncated_leads_instead_of_stale_task_confirmation(): void
    {
        [$company, $admin, $pipelineId] = $this->seedCompanyAdminWithPipeline();

        for ($i = 1; $i <= 15; $i++) {
            Lead::query()->create([
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'created_by_user_id' => $admin->id,
                'name' => 'Lead ' . $i,
                'status' => 'new',
                'priority' => 'medium',
                'source' => 'manual',
                'location' => 'Lagos, Nigeria',
            ]);
        }

        $taskPreview = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Create a task for tomorrow titled Inspect HQ',
            ]);

        $taskPreview
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'tasks.create')
            ->assertJsonPath('data.response.payload.confirmation_required', true);

        $threadId = (string) $taskPreview->json('data.thread_id');
        $this->assertNotSame('', $threadId);

        $leadsPreview = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'thread_id' => $threadId,
                'message' => 'Show my leads',
            ]);

        $leadsPreview
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'crm.top_leads');

        $previewPayload = $leadsPreview->json('data.response.payload');
        $this->assertIsArray($previewPayload);
        $this->assertTrue($previewPayload['truncated'] ?? false);

        $expanded = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'thread_id' => $threadId,
                'message' => 'yes please',
            ]);

        $expanded
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'crm.top_leads');

        $this->assertNotSame('tasks.create', $expanded->json('data.response.tool'));
        $this->assertNull($expanded->json('data.response.payload.confirmation_required'));

        $payload = $expanded->json('data.response.payload');
        $this->assertIsArray($payload);
        $this->assertSame(15, $payload['total'] ?? null);
        $this->assertSame(15, $payload['count'] ?? null);
        $this->assertFalse($payload['truncated'] ?? true);
    }

    public function test_go_ahead_still_confirms_when_action_confirmation_is_latest(): void
    {
        [$company, $admin] = $this->seedCompanyAdmin();
        $agent = User::factory()->createOne([
            'name' => 'Kelvin Agent',
            'email' => 'kelvin-' . Str::lower(Str::random(6)) . '@example.com',
            'is_active' => true,
        ]);
        $company->users()->attach($agent->id, ['role' => 'agent', 'joined_at' => now()]);

        $preview = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Create a task for Kelvin Agent to visit Shoprite tomorrow',
            ]);

        $preview
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'tasks.create')
            ->assertJsonPath('data.response.payload.confirmation_required', true);

        $threadId = (string) $preview->json('data.thread_id');

        $confirmed = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'thread_id' => $threadId,
                'message' => 'go ahead',
                'action_confirmed' => true,
                'action_args' => [
                    'title' => 'Visit Shoprite',
                    'type' => TaskType::SALES_VISIT->value,
                    'due_date' => now()->addDay()->toIso8601String(),
                    'location' => 'Shoprite',
                    'address' => 'Shoprite',
                    'assigned_agent_id' => $agent->id,
                    'priority' => TaskPriority::MEDIUM->value,
                    'description' => 'Visit Shoprite',
                ],
            ]);

        $confirmed
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'tasks.create');

        $content = strtolower((string) $confirmed->json('data.response.content'));
        $this->assertTrue(
            str_contains($content, 'created') || str_contains($content, 'success'),
            'Expected task creation success message, got: ' . $content
        );
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

    /**
     * @return array{0: Company, 1: User, 2: int}
     */
    private function seedCompanyAdminWithPipeline(): array
    {
        [$company, $admin] = $this->seedCompanyAdmin();

        $pipelineId = (int) LeadPipeline::query()->create([
            'company_id' => $company->id,
            'name' => 'Default Pipeline',
            'is_default' => true,
        ])->id;

        return [$company, $admin, $pipelineId];
    }
}
