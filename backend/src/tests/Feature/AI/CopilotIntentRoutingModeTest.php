<?php

declare(strict_types=1);

namespace Tests\Feature\AI;

use App\Models\Admin;
use App\Models\Company;
use App\Models\Task;
use App\Models\User;
use App\Services\AI\AiIntentRoutingSettingService;
use App\Services\AI\Providers\AiProviderRouter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Mockery;
use Tests\Support\AiGenerationTestFactory;
use Tests\TestCase;

final class CopilotIntentRoutingModeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        config([
            'services.ai.enable_read_synthesis' => false,
            'services.ai.enable_hybrid_router' => false,
            'services.ai.openai.api_key' => 'sk-test',
        ]);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    public function test_rules_first_routes_task_list_queries_without_create_action(): void
    {
        [$company, $user] = $this->seedCompanyUser();

        $response = $this->actingAs($user)->postJson('/api/v1/copilot/chat', [
            'company_id' => $company->id,
            'message' => 'Give me the list of tasks created by Agent John',
        ]);

        $response->assertOk();
        $this->assertSame('tasks.list', $response->json('data.response.tool'));
        $this->assertNull($response->json('data.response.payload.confirmation_required'));
    }

    public function test_rules_first_still_routes_explicit_task_creation_to_action(): void
    {
        [$company, $user] = $this->seedCompanyUser();

        $response = $this->actingAs($user)->postJson('/api/v1/copilot/chat', [
            'company_id' => $company->id,
            'message' => 'Create a task and assign it to John for tomorrow',
        ]);

        $response->assertOk();
        $this->assertSame('tasks.create', $response->json('data.response.tool'));
        $this->assertTrue((bool) $response->json('data.response.payload.confirmation_required'));
    }

    public function test_ai_first_uses_llm_router_for_task_list_before_regex_create_false_positive(): void
    {
        [$company, $user] = $this->seedCompanyUser();
        $this->setAiFirstRoutingMode();

        $mockRouter = Mockery::mock(AiProviderRouter::class);
        $mockRouter->shouldReceive('generateForPurpose')
            ->once()
            ->withArgs(function (string $purpose): bool {
                return $purpose === 'routing';
            })
            ->andReturn(AiGenerationTestFactory::result(
                text: '{"intent":"tool","tool":"tasks.list","confidence":0.93,"extracted_entities":{"created_by":"John"}}',
                purpose: 'routing',
            ));
        $mockRouter->shouldReceive('routingMetadata')->andReturn([
            'provider' => 'openai',
            'model' => 'gpt-4.1-mini',
            'purpose' => 'operational',
            'stack' => 'openai_claude',
        ]);
        $this->app->instance(AiProviderRouter::class, $mockRouter);

        Task::query()->create([
            'company_id' => $company->id,
            'created_by_user_id' => $user->id,
            'assigned_agent_id' => null,
            'last_status_updated_by_user_id' => $user->id,
            'title' => 'Sample routed task',
            'type' => 'inspection',
            'description' => 'Created for routing test coverage.',
            'location_text' => 'HQ',
            'address_full' => 'HQ',
            'due_at' => now()->addDay(),
            'priority' => 'medium',
            'status' => 'pending',
        ]);

        $response = $this->actingAs($user)->postJson('/api/v1/copilot/chat', [
            'company_id' => $company->id,
            'message' => 'What tasks were created by John?',
        ]);

        $response->assertOk();
        $this->assertSame('tasks.list', $response->json('data.response.tool'));
        $this->assertNull($response->json('data.response.payload.confirmation_required'));
    }

    public function test_ai_first_falls_back_to_rules_when_router_fails(): void
    {
        [$company, $user] = $this->seedCompanyUser();
        $this->setAiFirstRoutingMode();

        $mockRouter = Mockery::mock(AiProviderRouter::class);
        $mockRouter->shouldReceive('generateForPurpose')
            ->once()
            ->andReturn(null);
        $mockRouter->shouldReceive('routingMetadata')->andReturn([
            'provider' => 'openai',
            'model' => 'gpt-4.1-mini',
            'purpose' => 'operational',
            'stack' => 'openai_claude',
        ]);
        $this->app->instance(AiProviderRouter::class, $mockRouter);

        $response = $this->actingAs($user)->postJson('/api/v1/copilot/chat', [
            'company_id' => $company->id,
            'message' => 'Show me the list of tasks created by John',
        ]);

        $response->assertOk();
        $this->assertSame('tasks.list', $response->json('data.response.tool'));
    }

    /**
     * @return array{0: Company, 1: User}
     */
    private function seedCompanyUser(): array
    {
        $company = Company::query()->create([
            'company_id' => strtoupper(Str::random(10)),
            'name' => 'Intent Routing Co',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Operations',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $user = User::factory()->createOne(['is_active' => true, 'name' => 'Ops Admin']);
        $company->users()->attach($user->id, [
            'role' => 'admin',
            'joined_at' => now(),
        ]);

        return [$company, $user];
    }

    private function setAiFirstRoutingMode(): void
    {
        $admin = Admin::create([
            'name' => 'Super Admin',
            'email' => 'intent-routing-' . Str::lower(Str::random(6)) . '@example.com',
            'password' => 'StrongPass123!',
            'role' => 'super_admin',
            'is_active' => true,
        ]);

        app(AiIntentRoutingSettingService::class)->setMode(AiIntentRoutingSettingService::AI_FIRST, $admin);
    }
}
