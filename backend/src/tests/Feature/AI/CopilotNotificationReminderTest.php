<?php

declare(strict_types=1);

namespace Tests\Feature\AI;

use App\Enums\TaskPriority;
use App\Enums\TaskStatus;
use App\Enums\TaskType;
use App\Jobs\DeliverEmailNotificationJob;
use App\Models\AppNotification;
use App\Models\Company;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\TestCase;

final class CopilotNotificationReminderTest extends TestCase
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

    public function test_overdue_context_reminder_preview_targets_agents_from_thread(): void
    {
        [$company, $admin, $agentOne, $agentTwo] = $this->seedOverdueScenario();

        $overdue = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'What are the agents assigned to these overdue tasks?',
            ]);

        $overdue
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'tasks.overdue');

        $threadId = (string) $overdue->json('data.thread_id');

        $preview = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'thread_id' => $threadId,
                'message' => 'Can you send a reminder to these agents?',
            ]);

        $preview
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'notifications.send')
            ->assertJsonPath('data.response.payload.confirmation_required', true);

        $actionArgs = $preview->json('data.response.payload.action_args');
        $this->assertIsArray($actionArgs['user_ids'] ?? null);
        $this->assertEqualsCanonicalizing(
            [$agentOne->id, $agentTwo->id],
            $actionArgs['user_ids'],
        );
        $this->assertContains('John Wick', $actionArgs['recipient_names'] ?? []);
        $this->assertContains('Taraji Henson', $actionArgs['recipient_names'] ?? []);
        $this->assertStringContainsString('overdue', strtolower((string) ($actionArgs['message'] ?? '')));
    }

    public function test_confirming_reminder_sends_notifications_to_agents_and_queues_email(): void
    {
        Queue::fake();

        [$company, $admin, $agentOne, $agentTwo] = $this->seedOverdueScenario();

        $overdue = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Show overdue tasks',
            ]);

        $threadId = (string) $overdue->json('data.thread_id');

        $preview = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'thread_id' => $threadId,
                'message' => 'Send them a reminder about their overdue tasks',
            ]);

        $preview->assertOk()->assertJsonPath('data.response.tool', 'notifications.send');

        $actionArgs = $preview->json('data.response.payload.action_args');
        $this->assertIsArray($actionArgs);

        $confirm = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'thread_id' => $threadId,
                'message' => 'Send them a reminder about their overdue tasks',
                'action_confirmed' => true,
                'action_args' => [
                    'title' => $actionArgs['title'],
                    'message' => $actionArgs['message'],
                    'type' => $actionArgs['type'],
                    'category' => $actionArgs['category'],
                    'priority' => $actionArgs['priority'],
                    'user_ids' => implode(',', $actionArgs['user_ids']),
                    'delivery_types' => $actionArgs['delivery_types'],
                ],
            ]);

        $confirm
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'notifications.send');

        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $agentOne->id,
            'company_id' => $company->id,
            'category' => 'task',
        ]);

        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $agentTwo->id,
            'company_id' => $company->id,
            'category' => 'task',
        ]);

        $this->assertSame(2, AppNotification::query()->where('company_id', $company->id)->count());
        Queue::assertPushed(DeliverEmailNotificationJob::class, 2);
    }

    /**
     * @return array{0: Company, 1: User, 2: User, 3: User}
     */
    private function seedOverdueScenario(): array
    {
        $company = Company::query()->create([
            'company_id' => strtoupper(Str::random(10)),
            'name' => 'Factory Reminder Ops',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Operations management',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $admin = User::factory()->createOne(['name' => 'Manager Ada', 'is_active' => true]);
        $agentOne = User::factory()->createOne(['name' => 'John Wick', 'is_active' => true, 'email' => 'john.wick@example.com']);
        $agentTwo = User::factory()->createOne(['name' => 'Taraji Henson', 'is_active' => true, 'email' => 'taraji.henson@example.com']);

        $company->users()->attach($admin->id, ['role' => 'admin', 'joined_at' => now()]);
        $company->users()->attach($agentOne->id, ['role' => 'agent', 'joined_at' => now()]);
        $company->users()->attach($agentTwo->id, ['role' => 'agent', 'joined_at' => now()]);

        foreach ([
            [$agentOne, 'test the task stuff'],
            [$agentOne, 'Outreach to Bokku'],
            [$agentTwo, 'Visit Lekki'],
        ] as [$agent, $title]) {
            Task::query()->create([
                'company_id' => $company->id,
                'created_by_user_id' => $admin->id,
                'assigned_agent_id' => $agent->id,
                'last_status_updated_by_user_id' => $admin->id,
                'title' => $title,
                'type' => TaskType::SALES_VISIT->value,
                'due_at' => now()->subDay(),
                'priority' => TaskPriority::HIGH->value,
                'status' => TaskStatus::PENDING->value,
            ]);
        }

        return [$company, $admin, $agentOne, $agentTwo];
    }
}
