<?php

declare(strict_types=1);

namespace Tests\Unit\AI;

use App\Models\Company;
use App\Models\User;
use App\Services\AI\Context\ConversationMemoryService;
use App\Services\AI\NotificationInferenceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

final class NotificationInferenceServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_coerce_user_ids_normalizes_scalar_string_and_array_inputs(): void
    {
        $service = $this->app->make(NotificationInferenceService::class);

        $this->assertSame([35], $service->coerceUserIds(35));
        $this->assertSame([35], $service->coerceUserIds('35'));
        $this->assertSame([35, 39], $service->coerceUserIds('35,39'));
        $this->assertSame([35, 39], $service->coerceUserIds([35, 39]));
        $this->assertSame([35, 39], $service->coerceUserIds('[35,39]'));
        $this->assertSame([], $service->coerceUserIds(''));
        $this->assertSame([], $service->coerceUserIds(null));
    }

    public function test_resolve_recipients_from_latest_tasks_overdue_thread_payload(): void
    {
        [$company, $admin, $agentOne, $agentTwo] = $this->seedReminderScenario();

        $memory = $this->app->make(ConversationMemoryService::class);
        $thread = $memory->appendMessage(
            (int) $company->id,
            (int) $admin->id,
            null,
            'user',
            'What agents are assigned to overdue tasks?',
        );

        $memory->appendMessage(
            (int) $company->id,
            (int) $admin->id,
            (string) $thread['thread_id'],
            'assistant',
            'John Wick and Taraji Henson have overdue tasks.',
            ['tasks.overdue'],
            'tasks.overdue',
            [
                'items' => [
                    [
                        'id' => 1,
                        'title' => 'test the task stuff',
                        'assigned_agent_id' => $agentOne->id,
                        'assigned_agent_name' => 'John Wick',
                    ],
                    [
                        'id' => 2,
                        'title' => 'Visit Lekki',
                        'assigned_agent_id' => $agentTwo->id,
                        'assigned_agent_name' => 'Taraji Henson',
                    ],
                ],
                'count' => 2,
            ],
        );

        $service = $this->app->make(NotificationInferenceService::class);
        $context = $service->resolveRecipientsFromThread((string) $thread['thread_id'], (int) $company->id, (int) $admin->id);

        $this->assertSame([$agentOne->id, $agentTwo->id], $context['user_ids']);
        $this->assertSame(['John Wick', 'Taraji Henson'], $context['recipient_names']);
    }

    public function test_normalize_provided_args_coerces_string_user_ids_for_confirm_path(): void
    {
        [$company, $admin, $agentOne] = $this->seedReminderScenario();

        $service = $this->app->make(NotificationInferenceService::class);
        $normalized = $service->normalizeProvidedArgs((int) $company->id, [
            'title' => 'Overdue task reminder',
            'message' => 'Please complete your overdue tasks today.',
            'user_ids' => (string) $agentOne->id . ',99999',
        ]);

        $this->assertSame([(int) $agentOne->id, 99999], $normalized['user_ids']);
        $this->assertTrue(($normalized['__inference']['recipients_unresolved'] ?? false) === true);
    }

    /**
     * @return array{0: Company, 1: User, 2: User, 3: User}
     */
    private function seedReminderScenario(): array
    {
        $company = Company::query()->create([
            'company_id' => strtoupper(Str::random(10)),
            'name' => 'Factory Reminder',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Operations management',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $admin = User::factory()->createOne(['name' => 'Manager Ada']);
        $agentOne = User::factory()->createOne(['name' => 'John Wick']);
        $agentTwo = User::factory()->createOne(['name' => 'Taraji Henson']);

        $company->users()->attach($admin->id, ['role' => 'admin', 'joined_at' => now()]);
        $company->users()->attach($agentOne->id, ['role' => 'agent', 'joined_at' => now()]);
        $company->users()->attach($agentTwo->id, ['role' => 'agent', 'joined_at' => now()]);

        return [$company, $admin, $agentOne, $agentTwo];
    }
}
