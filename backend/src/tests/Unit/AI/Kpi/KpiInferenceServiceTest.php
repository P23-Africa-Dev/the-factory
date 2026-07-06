<?php

declare(strict_types=1);

namespace Tests\Unit\AI\Kpi;

use App\Models\Company;
use App\Models\User;
use App\Services\AI\Kpi\KpiInferenceService;
use App\Services\AI\Providers\AiProviderRouter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Mockery;
use Tests\Support\AiGenerationTestFactory;
use Tests\TestCase;

final class KpiInferenceServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_infer_extracts_structured_kpi_fields_from_labeled_message(): void
    {
        [$company, , $agent] = $this->seedCompanyUsers();

        $service = $this->makeService();

        $args = $service->infer(
            message: 'Create KPI. KPI name: Retail Visits. Objective: Increase qualified retailer visits in Lagos. Target value: 50 visits. Expected outcome: Reach 50 qualified retailer sign-ups this month. Priority: high. Assign to: ' . $agent->name,
            companyId: (int) $company->id,
            entities: [],
        );

        $this->assertSame('Retail Visits', $args['name']);
        $this->assertSame('customer_visits', $args['category']);
        $this->assertSame('high', $args['priority']);
        $this->assertSame('50 visits', $args['target_value']);
        $this->assertSame((int) $agent->id, $args['assigned_to_user_id']);
        $this->assertGreaterThanOrEqual(10, mb_strlen((string) $args['objective']));
        $this->assertGreaterThanOrEqual(10, mb_strlen((string) $args['expected_outcome']));
    }

    public function test_warning_codes_flag_missing_required_fields(): void
    {
        $service = $this->makeService();

        $codes = $service->warningCodes([
            'name' => '',
            'objective' => 'short',
            'target_value' => 'To be defined',
            'expected_outcome' => 'tiny',
        ]);

        $this->assertContains('missing_kpi_name', $codes);
        $this->assertContains('missing_objective', $codes);
        $this->assertContains('missing_target_value', $codes);
        $this->assertContains('missing_expected_outcome', $codes);
    }

    public function test_infer_resolves_agent_from_for_agent_phrase_with_lowercase_name(): void
    {
        [$company, , $agent] = $this->seedCompanyUsers();
        $agent->update(['name' => 'Son']);

        $service = $this->makeService();

        $args = $service->infer(
            message: 'Set up a KPI for that agent Son to improve retailer visits this month',
            companyId: (int) $company->id,
            entities: [],
        );

        $this->assertSame((int) $agent->id, $args['assigned_to_user_id']);
        $this->assertNotSame('New KPI', $args['name']);
        $this->assertGreaterThanOrEqual(10, mb_strlen((string) $args['objective']));
        $this->assertNotSame('To be defined', $args['target_value']);
        $this->assertFalse($args['__inference']['assignee_unresolved'] ?? true);
    }

    public function test_warning_codes_clear_after_successful_inference_fallbacks(): void
    {
        [$company, , $agent] = $this->seedCompanyUsers();
        $agent->update(['name' => 'Son']);

        $service = $this->makeService();
        $args = $service->infer(
            message: 'Set up a KPI for that agent Son to improve retailer visits this month',
            companyId: (int) $company->id,
        );

        $codes = $service->warningCodes($args);
        $this->assertNotContains('missing_kpi_name', $codes);
        $this->assertNotContains('missing_objective', $codes);
        $this->assertNotContains('missing_target_value', $codes);
        $this->assertNotContains('missing_expected_outcome', $codes);
        $this->assertNotContains('assignee_unresolved', $codes);
    }

    private function makeService(): KpiInferenceService
    {
        $this->app->instance(AiProviderRouter::class, $this->mockRouter());

        return $this->app->make(KpiInferenceService::class);
    }

    private function mockRouter(): AiProviderRouter
    {
        $mock = Mockery::mock(AiProviderRouter::class);
        $mock->shouldReceive('generateForPurpose')->andReturn(
            AiGenerationTestFactory::result('Retail Visits KPI'),
            AiGenerationTestFactory::result('Increase qualified retailer visits in the assigned territory.'),
            AiGenerationTestFactory::result('50 visits'),
            AiGenerationTestFactory::result('Retailer Visit Performance'),
            AiGenerationTestFactory::result('Improve retailer visit performance for the assigned agent this month.'),
            AiGenerationTestFactory::result('50 visits'),
        );

        return $mock;
    }

    /**
     * @return array{0: Company, 1: User, 2: User}
     */
    private function seedCompanyUsers(): array
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

        /** @var User $owner */
        $owner = User::factory()->createOne();
        $company->users()->attach($owner->id, ['role' => 'owner', 'joined_at' => now()]);

        /** @var User $agent */
        $agent = User::factory()->createOne(['name' => 'John Wick']);
        $company->users()->attach($agent->id, ['role' => 'agent', 'joined_at' => now()]);

        return [$company, $owner, $agent];
    }
}
