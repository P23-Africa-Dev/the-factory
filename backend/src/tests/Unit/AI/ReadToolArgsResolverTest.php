<?php

declare(strict_types=1);

namespace Tests\Unit\AI;

use App\Models\Company;
use App\Models\User;
use App\Services\AI\Context\ConversationMemoryService;
use App\Services\AI\ReadToolArgsResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

final class ReadToolArgsResolverTest extends TestCase
{
    use RefreshDatabase;

    private ReadToolArgsResolver $resolver;

    protected function setUp(): void
    {
        parent::setUp();
        $this->resolver = $this->app->make(ReadToolArgsResolver::class);
    }

    public function test_how_many_in_lagos_sets_count_only_and_preview_limit(): void
    {
        $args = $this->resolver->resolve(
            'crm.top_leads',
            'How many leads do I have in Lagos?',
            'admin',
        );

        $this->assertTrue($args['count_only'] ?? false);
        $this->assertSame(10, $args['limit']);
        $this->assertFalse($args['expand_full_list']);
    }

    public function test_show_my_leads_uses_preview_not_full_expansion(): void
    {
        $args = $this->resolver->resolve(
            'crm.top_leads',
            'show my leads',
            'owner',
        );

        $this->assertSame(10, $args['limit']);
        $this->assertFalse($args['expand_full_list']);
        $this->assertArrayNotHasKey('count_only', $args);
    }

    public function test_explicit_list_all_sets_expand_full_list(): void
    {
        $args = $this->resolver->resolve(
            'tasks.overdue',
            'List all my overdue tasks',
            'admin',
        );

        $this->assertTrue($args['expand_full_list']);
        $this->assertSame(50, $args['limit']);
    }

    public function test_affirmative_follow_up_after_truncated_thread_expands(): void
    {
        [$company, $admin] = $this->seedCompanyAdmin();
        $memory = $this->app->make(ConversationMemoryService::class);

        $thread = $memory->appendMessage(
            (int) $company->id,
            (int) $admin->id,
            null,
            'user',
            'Show overdue tasks',
        );

        $threadId = (string) $thread['thread_id'];

        $memory->appendMessage(
            (int) $company->id,
            (int) $admin->id,
            $threadId,
            'assistant',
            'You have 15 overdue tasks. Showing 10 (5 more).',
            ['tasks.overdue'],
            'tasks.overdue',
            [
                'items' => array_fill(0, 10, ['id' => 1, 'title' => 'Overdue task']),
                'count' => 10,
                'total' => 15,
                'truncated' => true,
                'remaining_count' => 5,
                'offer_full_list' => true,
            ],
        );

        $args = $this->resolver->resolve(
            'tasks.overdue',
            'Yes, list them all',
            'admin',
            $threadId,
            (int) $company->id,
            (int) $admin->id,
        );

        $this->assertTrue($args['expand_full_list']);
        $this->assertSame(50, $args['limit']);
    }

    public function test_affirmative_binds_to_latest_truncated_list_not_older_confirmation(): void
    {
        [$company, $admin] = $this->seedCompanyAdmin();
        $memory = $this->app->make(ConversationMemoryService::class);

        $thread = $memory->appendMessage(
            (int) $company->id,
            (int) $admin->id,
            null,
            'user',
            'Create a task',
        );
        $threadId = (string) $thread['thread_id'];

        $memory->appendMessage(
            (int) $company->id,
            (int) $admin->id,
            $threadId,
            'assistant',
            'ELY action ready: create task',
            ['tasks.create'],
            'tasks.create',
            [
                'confirmation_required' => true,
                'tool' => 'tasks.create',
                'title' => 'Task created by ELY',
            ],
        );

        $memory->appendMessage(
            (int) $company->id,
            (int) $admin->id,
            $threadId,
            'user',
            'Show my leads',
        );

        $memory->appendMessage(
            (int) $company->id,
            (int) $admin->id,
            $threadId,
            'assistant',
            'You have 15 leads. Showing 10 (5 more). Would you like me to list all of them?',
            ['crm.top_leads'],
            'crm.top_leads',
            [
                'items' => array_fill(0, 10, ['id' => 1, 'name' => 'Lead']),
                'count' => 10,
                'total' => 15,
                'truncated' => true,
                'remaining_count' => 5,
                'offer_full_list' => true,
            ],
        );

        $this->assertTrue(
            $this->resolver->latestAssistantTurnIsTruncatedListOffer(
                $threadId,
                (int) $company->id,
                (int) $admin->id,
            )
        );

        $this->assertSame(
            'crm.top_leads',
            $this->resolver->resolveTruncatedListToolFromThread(
                'yes please',
                $threadId,
                (int) $company->id,
                (int) $admin->id,
            )
        );
    }

    public function test_affirmative_does_not_expand_when_latest_turn_is_action_confirmation(): void
    {
        [$company, $admin] = $this->seedCompanyAdmin();
        $memory = $this->app->make(ConversationMemoryService::class);

        $thread = $memory->appendMessage(
            (int) $company->id,
            (int) $admin->id,
            null,
            'user',
            'Show overdue tasks',
        );
        $threadId = (string) $thread['thread_id'];

        $memory->appendMessage(
            (int) $company->id,
            (int) $admin->id,
            $threadId,
            'assistant',
            'You have 15 overdue tasks. Showing 10 (5 more).',
            ['tasks.overdue'],
            'tasks.overdue',
            [
                'count' => 10,
                'total' => 15,
                'truncated' => true,
                'remaining_count' => 5,
                'offer_full_list' => true,
            ],
        );

        $memory->appendMessage(
            (int) $company->id,
            (int) $admin->id,
            $threadId,
            'user',
            'Create a task',
        );

        $memory->appendMessage(
            (int) $company->id,
            (int) $admin->id,
            $threadId,
            'assistant',
            'ELY action ready: create task',
            ['tasks.create'],
            'tasks.create',
            [
                'confirmation_required' => true,
                'tool' => 'tasks.create',
            ],
        );

        $this->assertNull(
            $this->resolver->resolveTruncatedListToolFromThread(
                'yes please',
                $threadId,
                (int) $company->id,
                (int) $admin->id,
            )
        );

        $this->assertSame(
            'tasks.overdue',
            $this->resolver->resolveTruncatedListToolFromThread(
                'list them all',
                $threadId,
                (int) $company->id,
                (int) $admin->id,
            )
        );
    }

    public function test_non_list_tool_returns_empty_args(): void
    {
        $args = $this->resolver->resolve(
            'planning.daily',
            'Plan my day',
            'admin',
        );

        $this->assertSame([], $args);
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
