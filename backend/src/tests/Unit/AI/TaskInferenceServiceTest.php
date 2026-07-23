<?php

declare(strict_types=1);

namespace Tests\Unit\AI;

use App\Models\Company;
use App\Models\User;
use App\Services\AI\Providers\AiGenerationResult;
use App\Services\AI\Providers\AiProviderRouter;
use App\Services\AI\TaskInferenceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use Tests\TestCase;

class TaskInferenceServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_reported_prompt_extracts_clean_title_location_and_assignee(): void
    {
        $company = Company::query()->create([
            'company_id' => 'CMPTARAJI1',
            'name' => 'Factory Taraji',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Operations management',
            'status' => 'active',
            'activated_at' => now(),
        ]);
        $agent = User::factory()->create([
            'name' => 'Taraji Henson',
            'email' => 'taraji@example.com',
        ]);
        $company->users()->attach($agent->id, [
            'role' => 'agent',
            'joined_at' => now(),
        ]);

        $router = Mockery::mock(AiProviderRouter::class);
        $router->shouldReceive('generateForPurpose')->andReturn(
            new AiGenerationResult(text: null, provider: 'mock', model: 'test')
        );

        $service = new TaskInferenceService($router);
        $args = $service->infer(
            message: 'Create a task to visit a client at Lekki Phase II and assign Taraji Henson to it',
            companyId: (int) $company->id,
            role: 'admin',
        );

        $this->assertSame('Visit client', $args['title']);
        $this->assertSame('sales_visit', $args['type']);
        $this->assertSame('Lekki Phase II', $args['location']);
        $this->assertStringContainsString('Lekki Phase II', (string) $args['address']);
        $this->assertStringNotContainsString('assign Taraji', (string) $args['location']);
        $this->assertStringNotContainsString('assign Taraji', (string) $args['title']);
        $this->assertSame((int) $agent->id, $args['assigned_agent_id']);
        $this->assertFalse((bool) ($args['__inference']['assignee_unresolved'] ?? true));
    }

    public function test_correction_patches_location_on_existing_args(): void
    {
        $router = Mockery::mock(AiProviderRouter::class);
        $router->shouldReceive('generateForPurpose')->never();

        $service = new TaskInferenceService($router);
        $patched = $service->patchFromCorrection(
            message: 'include location Lekki Phase II',
            currentArgs: [
                'title' => 'Visit client',
                'type' => 'sales_visit',
                'location' => 'Operations Center',
                'address' => 'Operations Center',
            ],
            companyId: 1,
            role: 'admin',
        );

        $this->assertSame('Lekki Phase II', $patched['location']);
        $this->assertTrue($service->looksLikeCorrection('include location Lekki Phase II'));
        $this->assertFalse($service->looksLikeCorrection('Create a task to visit a client'));
    }
}
