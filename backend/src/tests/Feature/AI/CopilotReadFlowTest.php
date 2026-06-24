<?php

declare(strict_types=1);

namespace Tests\Feature\AI;

use App\Enums\TaskPriority;
use App\Enums\TaskStatus;
use App\Enums\TaskType;
use App\Models\Company;
use App\Models\Task;
use App\Models\User;
use App\Services\AI\Providers\AiProviderRouter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Mockery;
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

    public function test_follow_up_general_prompt_includes_thread_context_and_entities(): void
    {
        [$company, $admin] = $this->seedCompanyAdmin();

        $capturedPrompts = [];
        $mockRouter = Mockery::mock(AiProviderRouter::class);
        $mockRouter
            ->shouldReceive('generateText')
            ->twice()
            ->andReturnUsing(function (string $systemPrompt, string $userPrompt) use (&$capturedPrompts): string {
                $capturedPrompts[] = $userPrompt;

                return 'Provider response';
            });

        $this->app->instance(AiProviderRouter::class, $mockRouter);

        $first = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Generate a report for agent John Doe.',
            ]);

        $first->assertOk();

        $second = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'thread_id' => $first->json('data.thread_id'),
                'message' => 'Now do the same for that agent and make it shorter.',
            ]);

        $second->assertOk();

        $this->assertCount(2, $capturedPrompts);
        $this->assertStringContainsString('Conversation summary:', $capturedPrompts[1]);
        $this->assertStringContainsString('Recent conversation:', $capturedPrompts[1]);
        $this->assertStringContainsString('same agent refers to: john doe', strtolower($capturedPrompts[1]));
    }

    public function test_general_prompt_uses_company_name_instead_of_company_codename(): void
    {
        [$company, $admin] = $this->seedCompanyAdmin();
        $company->name = 'Acme Industrial Logistics';
        $company->save();

        $capturedPrompt = null;
        $capturedSystemPrompt = null;
        $mockRouter = Mockery::mock(AiProviderRouter::class);
        $mockRouter
            ->shouldReceive('generateText')
            ->once()
            ->andReturnUsing(function (string $systemPrompt, string $userPrompt) use (&$capturedPrompt, &$capturedSystemPrompt): string {
                $capturedPrompt = $userPrompt;
                $capturedSystemPrompt = $systemPrompt;

                return 'Provider response';
            });

        $this->app->instance(AiProviderRouter::class, $mockRouter);

        $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Give me a short operating summary.',
            ])
            ->assertOk();

        $this->assertIsString($capturedPrompt);
        $this->assertIsString($capturedSystemPrompt);
        $this->assertStringContainsString('You are ELY', $capturedSystemPrompt);
        $this->assertStringContainsString('Company name: Acme Industrial Logistics', $capturedPrompt);
        $this->assertStringContainsString('Tenant scope ID (internal, do not mention):', $capturedPrompt);
    }

    public function test_streaming_general_prompt_passes_chat_context_and_returns_sse_reply(): void
    {
        [$company, $admin] = $this->seedCompanyAdmin();

        $mockRouter = Mockery::mock(AiProviderRouter::class);
        $mockRouter
            ->shouldReceive('routingMetadata')
            ->once()
            ->with('operational')
            ->andReturn([
                'provider' => 'openai',
                'model' => 'gpt-4.1-mini',
                'purpose' => 'operational',
            ]);
        $mockRouter
            ->shouldReceive('generateForPurpose')
            ->once()
            ->andReturn('Hello from ELY streaming.');
        $this->app->instance(AiProviderRouter::class, $mockRouter);

        $response = $this
            ->actingAs($admin)
            ->withHeaders(['Accept' => 'text/event-stream'])
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Hello',
                'stream' => true,
                'context' => [
                    'latitude' => 6.5244,
                    'longitude' => 3.3792,
                ],
            ]);

        $response->assertOk();

        $content = $response->streamedContent();
        $this->assertStringContainsString('event: done', $content);
        $this->assertStringContainsString('Hello from ELY streaming.', $content);
        $this->assertStringNotContainsString('unable to complete that request', strtolower($content));
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
