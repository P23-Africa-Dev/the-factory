<?php

declare(strict_types=1);

namespace Tests\Feature\AI;

use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

final class CopilotChatHistoryPaginationTest extends TestCase
{
    use RefreshDatabase;

    public function test_thread_show_returns_latest_messages_with_pagination(): void
    {
        [$company, $admin] = $this->seedCompanyAdmin();

        $first = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Show me overdue tasks right now',
            ]);

        $first->assertOk();
        $threadId = (string) $first->json('data.thread_id');

        for ($i = 0; $i < 24; $i++) {
            $this
                ->actingAs($admin)
                ->postJson('/api/v1/copilot/chat', [
                    'company_id' => $company->id,
                    'thread_id' => $threadId,
                    'message' => 'Show me overdue tasks again ' . ($i + 1),
                ])
                ->assertOk();
        }

        $show = $this
            ->actingAs($admin)
            ->getJson('/api/v1/copilot/threads/' . $threadId, [
                'company_id' => $company->id,
            ]);

        $show->assertOk()
            ->assertJsonPath('data.thread.message_count', 50)
            ->assertJsonPath('data.thread.pagination.has_more', true)
            ->assertJsonCount(20, 'data.thread.messages')
            ->assertJsonPath('data.thread.pagination.loaded_count', 20);

        $this->assertNotEmpty($show->json('data.thread.pagination.next_cursor'));
    }

    public function test_thread_messages_endpoint_returns_older_messages_by_cursor(): void
    {
        [$company, $admin] = $this->seedCompanyAdmin();

        $first = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Show me overdue tasks right now',
            ]);

        $threadId = (string) $first->json('data.thread_id');

        for ($i = 0; $i < 24; $i++) {
            $this
                ->actingAs($admin)
                ->postJson('/api/v1/copilot/chat', [
                    'company_id' => $company->id,
                    'thread_id' => $threadId,
                    'message' => 'Show me overdue tasks again ' . ($i + 1),
                ])
                ->assertOk();
        }

        $show = $this
            ->actingAs($admin)
            ->getJson('/api/v1/copilot/threads/' . $threadId, [
                'company_id' => $company->id,
            ]);

        $show->assertOk();
        $cursor = (string) $show->json('data.thread.pagination.next_cursor');

        $page = $this
            ->actingAs($admin)
            ->getJson('/api/v1/copilot/threads/' . $threadId . '/messages', [
                'company_id' => $company->id,
                'cursor' => $cursor,
            ]);

        $page->assertOk()
            ->assertJsonPath('data.pagination.has_more', true)
            ->assertJsonCount(20, 'data.messages')
            ->assertJsonPath('data.pagination.loaded_count', 20);

        $this->assertNotEmpty($page->json('data.pagination.next_cursor'));
    }

    public function test_thread_history_is_not_accessible_from_other_company_context(): void
    {
        [$companyA, $adminA] = $this->seedCompanyAdmin();
        [$companyB, $adminB] = $this->seedCompanyAdmin();

        $first = $this
            ->actingAs($adminA)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $companyA->id,
                'message' => 'Show me overdue tasks right now',
            ]);

        $threadId = (string) $first->json('data.thread_id');

        $this
            ->actingAs($adminB)
            ->getJson('/api/v1/copilot/threads/' . $threadId, [
                'company_id' => $companyB->id,
            ])
            ->assertStatus(404);
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
