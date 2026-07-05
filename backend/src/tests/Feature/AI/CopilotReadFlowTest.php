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
use App\Services\AI\Providers\AiProviderRouter;
use Tests\Support\AiGenerationTestFactory;
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
            ->shouldReceive('routingMetadata')
            ->with('operational')
            ->andReturn([
                'provider' => 'openai',
                'model' => 'gpt-4.1-mini',
                'purpose' => 'operational',
            ]);
        $mockRouter
            ->shouldReceive('generateForPurpose')
            ->twice()
            ->withArgs(function (string $purpose): bool {
                return $purpose === 'operational';
            })
            ->andReturnUsing(function (string $purpose, string $systemPrompt, string $userPrompt) use (&$capturedPrompts) {
                $capturedPrompts[] = $userPrompt;

                return AiGenerationTestFactory::result('Provider response');
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
            ->shouldReceive('routingMetadata')
            ->with('operational')
            ->andReturn([
                'provider' => 'openai',
                'model' => 'gpt-4.1-mini',
                'purpose' => 'operational',
            ]);
        $mockRouter
            ->shouldReceive('generateForPurpose')
            ->once()
            ->withArgs(function (string $purpose): bool {
                return $purpose === 'operational';
            })
            ->andReturnUsing(function (string $purpose, string $systemPrompt, string $userPrompt) use (&$capturedPrompt, &$capturedSystemPrompt) {
                $capturedPrompt = $userPrompt;
                $capturedSystemPrompt = $systemPrompt;

                return AiGenerationTestFactory::result('Provider response');
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

    public function test_owner_can_list_crm_leads_from_natural_language_prompt(): void
    {
        [$company, $owner] = $this->seedCompanyAdmin('owner');
        $pipelineId = $this->seedLeadPipeline($company->id);

        Lead::query()->create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $owner->id,
            'name' => 'Acme Supplies Ltd',
            'status' => 'new',
            'priority' => 'high',
            'source' => 'manual',
        ]);

        $response = $this
            ->actingAs($owner)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'provide me the list of leads in my crm',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'crm.top_leads')
            ->assertJsonPath('data.response.sources.0', 'crm.top_leads');

        $content = (string) $response->json('data.response.content');
        $this->assertStringContainsString('Acme Supplies Ltd', $content);
        $this->assertStringNotContainsString('data connection', strtolower($content));
    }

    public function test_owner_can_list_organization_users(): void
    {
        [$company, $owner] = $this->seedCompanyAdmin('owner');
        $agent = User::factory()->createOne([
            'name' => 'John Wick',
            'email' => 'john.wick@example.com',
        ]);
        $company->users()->attach($agent->id, [
            'role' => 'agent',
            'joined_at' => now(),
        ]);

        $response = $this
            ->actingAs($owner)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'list users under this organisation',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'org.users')
            ->assertJsonPath('data.response.sources.0', 'org.users');

        $content = (string) $response->json('data.response.content');
        $this->assertStringContainsString('John Wick', $content);
        $this->assertStringNotContainsString('data connection', strtolower($content));
    }

    public function test_agent_cannot_list_organization_users(): void
    {
        [$company, $agent] = $this->seedCompanyAdmin('agent');

        $response = $this
            ->actingAs($agent)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'list users under this organisation',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'org.users')
            ->assertJsonPath('data.response.payload.denied', true);

        $content = (string) $response->json('data.response.content');
        $this->assertStringContainsString('not permitted', strtolower($content));
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
            ->andReturn(AiGenerationTestFactory::result('Hello from ELY streaming.'));
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
    private function seedCompanyAdmin(string $role = 'admin'): array
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
        $admin = User::factory()->createOne([
            'is_active' => true,
        ]);

        $company->users()->attach($admin->id, [
            'role' => $role,
            'joined_at' => now(),
        ]);

        return [$company, $admin];
    }

    private function seedLeadPipeline(int $companyId): int
    {
        return (int) LeadPipeline::query()->create([
            'company_id' => $companyId,
            'name' => 'Default Pipeline',
            'is_default' => true,
        ])->id;
    }
}
