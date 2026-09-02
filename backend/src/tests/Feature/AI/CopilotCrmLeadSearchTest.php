<?php

declare(strict_types=1);

namespace Tests\Feature\AI;

use App\Models\Company;
use App\Models\Lead;
use App\Models\LeadPipeline;
use App\Models\User;
use App\Services\AI\Tools\ReadToolRegistry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

final class CopilotCrmLeadSearchTest extends TestCase
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

    public function test_how_many_lagos_leads_reports_matched_and_organization_totals(): void
    {
        [$company, $owner, $pipelineId] = $this->seedOwnerWithPipeline();

        for ($i = 1; $i <= 7; $i++) {
            Lead::query()->create([
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'created_by_user_id' => $owner->id,
                'name' => 'Lagos Lead ' . $i,
                'status' => 'new',
                'priority' => 'medium',
                'source' => 'manual',
                'location' => sprintf('Street %d, Lagos, Nigeria', $i),
            ]);
        }

        for ($i = 1; $i <= 7; $i++) {
            Lead::query()->create([
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'created_by_user_id' => $owner->id,
                'name' => 'Abuja Lead ' . $i,
                'status' => 'new',
                'priority' => 'medium',
                'source' => 'manual',
                'location' => 'Abuja, Nigeria',
            ]);
        }

        $response = $this
            ->actingAs($owner)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'How many leads do I have in Lagos?',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'crm.top_leads');

        $payload = $response->json('data.response.payload');
        $this->assertIsArray($payload);
        $this->assertSame('Lagos', $payload['search'] ?? null);
        $this->assertSame(7, $payload['matched_total'] ?? null);
        $this->assertSame(14, $payload['total'] ?? null);
        $this->assertTrue($payload['count_only'] ?? false);
        $this->assertLessThanOrEqual(10, count($payload['items'] ?? []));

        $summary = (string) $response->json('data.response.content');
        $this->assertStringContainsString('7', $summary);
        $this->assertStringContainsString('14', $summary);
        $this->assertStringContainsString('Lagos', $summary);
    }

    public function test_owner_lagos_query_returns_all_matching_leads_not_only_recent_five(): void
    {
        [$company, $owner, $pipelineId] = $this->seedOwnerWithPipeline();

        $lagosNames = ['yello', 'Greet Filling Station', 'Breath School', 'Zet Bank', 'Faith University', 'Tester Sam'];
        $otherNames = ['John Wick', 'Bill Gate', 'Steve Job', 'Elon Musk', 'Mike Joe', 'Deen Lead', 'Elijah Banks', 'Christian Babalola'];

        foreach ($lagosNames as $index => $name) {
            Lead::query()->create([
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'created_by_user_id' => $owner->id,
                'name' => $name,
                'status' => 'new',
                'priority' => 'medium',
                'source' => 'manual',
                'location' => sprintf('%s Street %d, Lagos 10, Lagos, Nigeria', $name, $index + 1),
            ]);
        }

        foreach ($otherNames as $name) {
            Lead::query()->create([
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'created_by_user_id' => $owner->id,
                'name' => $name,
                'status' => 'new',
                'priority' => 'medium',
                'source' => 'manual',
                'location' => 'Abuja, Nigeria',
            ]);
        }

        $response = $this
            ->actingAs($owner)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'Do I have any leads in Lagos?',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'crm.top_leads');

        $payload = $response->json('data.response.payload');
        $this->assertIsArray($payload);
        $this->assertSame('Lagos', $payload['search'] ?? null);
        $this->assertSame(6, $payload['matched_total'] ?? null);
        $this->assertCount(6, $payload['items'] ?? []);

        $returnedNames = collect($payload['items'] ?? [])->pluck('name')->all();
        foreach ($lagosNames as $name) {
            $this->assertContains($name, $returnedNames, "Expected Lagos lead {$name} in tool payload");
        }

        $summary = (string) $response->json('data.response.content');
        $this->assertStringContainsString('Lagos', $summary);
        $this->assertStringContainsString('Faith University', $summary);
    }

    public function test_named_lead_follow_up_finds_leads_outside_recent_slice(): void
    {
        [$company, $owner, $pipelineId] = $this->seedOwnerWithPipeline();

        Lead::query()->create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $owner->id,
            'name' => 'Faith University',
            'status' => 'qualified',
            'priority' => 'medium',
            'source' => 'manual',
            'location' => 'Ora Ekpen 36, Lagos 10, Lagos, Nigeria',
        ]);

        Lead::query()->create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $owner->id,
            'name' => 'Zet Bank',
            'status' => 'contacted',
            'priority' => 'medium',
            'source' => 'manual',
            'location' => 'Ayinde Street 12, Lagos 10, Lagos, Nigeria',
        ]);

        for ($i = 1; $i <= 12; $i++) {
            Lead::query()->create([
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'created_by_user_id' => $owner->id,
                'name' => 'Recent Lead ' . $i,
                'status' => 'new',
                'priority' => 'medium',
                'source' => 'manual',
                'location' => 'Port Harcourt, Nigeria',
            ]);
        }

        $response = $this
            ->actingAs($owner)
            ->postJson('/api/v1/copilot/chat', [
                'company_id' => $company->id,
                'message' => 'What about Faith University and Zet Bank?',
            ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.response.tool', 'crm.top_leads');

        $payload = $response->json('data.response.payload');
        $this->assertContains('Faith University', $payload['found'] ?? []);
        $this->assertContains('Zet Bank', $payload['found'] ?? []);
        $this->assertSame([], $payload['not_found'] ?? null);

        $summary = (string) $response->json('data.response.content');
        $this->assertStringContainsString('Faith University', $summary);
        $this->assertStringContainsString('Zet Bank', $summary);
    }

    public function test_top_leads_summary_includes_location_field(): void
    {
        [$company, $owner, $pipelineId] = $this->seedOwnerWithPipeline();

        Lead::query()->create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $owner->id,
            'name' => 'yello',
            'status' => 'new',
            'priority' => 'medium',
            'source' => 'manual',
            'location' => 'Ayinde Are Street 12, Ikorodu 10, Lagos, Nigeria',
        ]);

        $result = $this->app->make(ReadToolRegistry::class)->execute(
            'crm.top_leads',
            $owner,
            (int) $company->id,
            ['search' => 'Lagos', 'limit' => 20],
        );

        $this->assertStringContainsString('Ayinde Are Street 12', (string) ($result['summary'] ?? ''));
        $this->assertTrue($result['payload']['truncated'] === false || is_bool($result['payload']['truncated']));
    }

    public function test_agent_only_sees_assigned_leads_in_search_results(): void
    {
        [$company, $owner, $pipelineId] = $this->seedOwnerWithPipeline();

        $agent = User::factory()->createOne(['name' => 'John Wick']);
        $company->users()->attach($agent->id, ['role' => 'agent', 'joined_at' => now()]);

        Lead::query()->create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $owner->id,
            'assigned_to_user_id' => $agent->id,
            'name' => 'Assigned Lagos Lead',
            'status' => 'new',
            'priority' => 'medium',
            'source' => 'manual',
            'location' => 'Lagos, Nigeria',
        ]);

        Lead::query()->create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $owner->id,
            'assigned_to_user_id' => $owner->id,
            'name' => 'Owner Only Lagos Lead',
            'status' => 'new',
            'priority' => 'medium',
            'source' => 'manual',
            'location' => 'Lagos, Nigeria',
        ]);

        $result = $this->app->make(ReadToolRegistry::class)->execute(
            'crm.top_leads',
            $agent,
            (int) $company->id,
            ['search' => 'Lagos', 'limit' => 20],
        );

        $names = collect($result['payload']['items'] ?? [])->pluck('name')->all();
        $this->assertContains('Assigned Lagos Lead', $names);
        $this->assertNotContains('Owner Only Lagos Lead', $names);
    }

    /**
     * @return array{0: Company, 1: User, 2: int}
     */
    private function seedOwnerWithPipeline(): array
    {
        $company = Company::query()->create([
            'company_id' => strtoupper(Str::random(10)),
            'name' => 'Factory CRM Search',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Operations management',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $owner = User::factory()->createOne(['is_active' => true]);
        $company->users()->attach($owner->id, ['role' => 'owner', 'joined_at' => now()]);

        $pipelineId = (int) LeadPipeline::query()->create([
            'company_id' => $company->id,
            'name' => 'Default Pipeline',
            'is_default' => true,
        ])->id;

        return [$company, $owner, $pipelineId];
    }
}
