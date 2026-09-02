<?php

declare(strict_types=1);

namespace Tests\Feature\AI;

use App\Models\Company;
use App\Models\User;
use App\Services\AI\Providers\AiProviderRouter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Mockery;
use Tests\Support\AiGenerationTestFactory;
use Tests\TestCase;

final class CopilotReadSynthesisTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    public function test_read_tool_response_can_be_synthesized_into_natural_language(): void
    {
        config(['services.ai.enable_read_synthesis' => true, 'services.ai.enable_hybrid_router' => false]);

        $company = Company::query()->create([
            'company_id' => strtoupper(Str::random(10)),
            'name' => 'Acme Ops',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Operations management',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $admin = User::factory()->createOne();
        $company->users()->attach($admin->id, ['role' => 'admin']);

        $mockRouter = Mockery::mock(AiProviderRouter::class);
        $mockRouter
            ->shouldReceive('routingMetadata')
            ->with('operational')
            ->andReturn(['provider' => 'openai', 'model' => 'gpt-4.1-mini', 'purpose' => 'operational']);
        $mockRouter
            ->shouldReceive('generateForPurpose')
            ->once()
            ->withArgs(fn (string $purpose): bool => $purpose === 'operational')
            ->andReturn(AiGenerationTestFactory::result('You have 2 overdue tasks that need attention today.'));

        $this->app->instance(AiProviderRouter::class, $mockRouter);

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Show overdue tasks',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'tasks.overdue')
            ->assertJsonPath('data.response.content', 'You have 2 overdue tasks that need attention today.');
    }
}
