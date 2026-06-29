<?php

declare(strict_types=1);

namespace Tests\Unit\AI\Crm;

use App\Enums\LeadPriority;
use App\Models\Company;
use App\Models\Lead;
use App\Models\LeadPipeline;
use App\Models\User;
use App\Services\AI\Crm\CrmIntelligenceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

final class CrmIntelligenceServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_follow_up_summary_scopes_to_agent_leads(): void
    {
        [$company, $agent, $otherAgent, $pipelineId] = $this->seedTwoAgents();

        Lead::query()->create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $otherAgent->id,
            'assigned_to_user_id' => $otherAgent->id,
            'name' => 'Other Lead',
            'status' => 'contacted',
            'priority' => LeadPriority::URGENT->value,
            'last_interaction_at' => now()->subDays(30),
        ]);

        Lead::query()->create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $agent->id,
            'assigned_to_user_id' => $agent->id,
            'name' => 'My Lead',
            'status' => 'contacted',
            'priority' => LeadPriority::HIGH->value,
            'last_interaction_at' => now()->subDays(20),
        ]);

        $result = app(CrmIntelligenceService::class)->followUpSummary($agent, $company->id);

        $this->assertSame('crm.follow_up_summary', $result['tool']);
        $names = array_column($result['payload']['items'], 'name');
        $this->assertContains('My Lead', $names);
        $this->assertNotContains('Other Lead', $names);
    }

    public function test_stale_leads_respects_threshold(): void
    {
        [$company, $agent, $pipelineId] = $this->seedAgentCompany();

        Lead::query()->create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $agent->id,
            'assigned_to_user_id' => $agent->id,
            'name' => 'Fresh Lead',
            'status' => 'contacted',
            'priority' => LeadPriority::MEDIUM->value,
            'last_interaction_at' => now()->subDays(3),
        ]);

        Lead::query()->create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $agent->id,
            'assigned_to_user_id' => $agent->id,
            'name' => 'Stale Lead',
            'status' => 'contacted',
            'priority' => LeadPriority::HIGH->value,
            'last_interaction_at' => now()->subDays(25),
        ]);

        $result = app(CrmIntelligenceService::class)->staleLeads($agent, $company->id, ['days' => 14]);

        $this->assertSame('crm.stale_leads', $result['tool']);
        $names = array_column($result['payload']['items'], 'name');
        $this->assertContains('Stale Lead', $names);
        $this->assertNotContains('Fresh Lead', $names);
    }

    /**
     * @return array{0: Company, 1: User, 2: int}
     */
    private function seedAgentCompany(): array
    {
        $company = Company::query()->create([
            'company_id' => strtoupper(Str::random(10)),
            'name' => 'CRM Co ' . Str::upper(Str::random(4)),
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Operations management',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        /** @var User $agent */
        $agent = User::factory()->createOne(['internal_role' => 'agent']);
        $company->users()->attach($agent->id, ['role' => 'agent', 'joined_at' => now()]);

        $pipelineId = LeadPipeline::query()->create([
            'company_id' => $company->id,
            'name' => 'Default',
            'slug' => 'default',
            'is_default' => true,
        ])->id;

        return [$company, $agent, $pipelineId];
    }

    /**
     * @return array{0: Company, 1: User, 2: User, 3: int}
     */
    private function seedTwoAgents(): array
    {
        [$company, $agent, $pipelineId] = $this->seedAgentCompany();
        /** @var User $otherAgent */
        $otherAgent = User::factory()->createOne(['internal_role' => 'agent']);
        $company->users()->attach($otherAgent->id, ['role' => 'agent', 'joined_at' => now()]);

        return [$company, $agent, $otherAgent, $pipelineId];
    }
}
