<?php

declare(strict_types=1);

namespace Tests\Feature\Crm;

use App\Models\Company;
use App\Models\Lead;
use App\Models\LeadPipeline;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class LeadIndustryTest extends TestCase
{
    use RefreshDatabase;

    public function test_industry_is_saved_updated_returned_and_filterable(): void
    {
        [$company, $admin, $pipelineId] = $this->seed_();
        $token = $admin->createToken('t', ['*'])->plainTextToken;

        $leadId = $this->withToken($token)->postJson('/api/v1/crm/leads', [
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'name' => 'Industry Lead',
            'industry' => '  Fintech & Payments ',
        ])->assertCreated()
            ->assertJsonPath('data.lead.industry', 'Fintech & Payments')
            ->json('data.lead.id');

        $this->withToken($token)->postJson('/api/v1/crm/leads', [
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'name' => 'Other Lead',
            'industry' => 'Logistics & Fleet',
        ])->assertCreated();

        $this->withToken($token)
            ->getJson('/api/v1/crm/leads?company_id=' . $company->id . '&industry=' . urlencode('Fintech & Payments'))
            ->assertOk()
            ->assertJsonPath('data.pagination.total', 1)
            ->assertJsonPath('data.items.0.id', $leadId);

        $this->withToken($token)->patchJson("/api/v1/crm/leads/{$leadId}", [
            'company_id' => $company->id,
            'industry' => 'Custom Industry Value',
        ])->assertOk()->assertJsonPath('data.lead.industry', 'Custom Industry Value');

        $this->withToken($token)->patchJson("/api/v1/crm/leads/{$leadId}", [
            'company_id' => $company->id,
            'industry' => null,
        ])->assertOk()->assertJsonPath('data.lead.industry', null);
    }

    public function test_industry_longer_than_120_chars_is_rejected(): void
    {
        [$company, $admin, $pipelineId] = $this->seed_();

        $this->withToken($admin->createToken('t', ['*'])->plainTextToken)
            ->postJson('/api/v1/crm/leads', [
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'name' => 'Too Long',
                'industry' => str_repeat('x', 121),
            ])
            ->assertUnprocessable()
            ->assertJsonStructure(['errors' => ['industry']]);
    }

    public function test_backfill_migration_copies_industry_from_custom_fields_and_meta(): void
    {
        [$company, $admin, $pipelineId] = $this->seed_();

        $fromCustom = Lead::query()->create([
            'company_id' => $company->id, 'pipeline_id' => $pipelineId, 'name' => 'A', 'created_by_user_id' => $admin->id,
            'priority' => 'medium', 'custom_fields' => ['industry' => 'Health & Pharma'],
        ]);
        $fromMeta = Lead::query()->create([
            'company_id' => $company->id, 'pipeline_id' => $pipelineId, 'name' => 'B', 'created_by_user_id' => $admin->id,
            'priority' => 'medium', 'meta' => ['industry' => 'Education'],
        ]);

        $migration = require database_path('migrations/2026_11_19_100100_add_industry_to_leads_table.php');
        $migration->down();
        $migration->up();

        $this->assertSame('Health & Pharma', $fromCustom->fresh()->industry);
        $this->assertSame('Education', $fromMeta->fresh()->industry);
    }

    /** @return array{0: Company, 1: User, 2: int} */
    private function seed_(): array
    {
        $company = Company::create([
            'company_id' => 'FAC-IND-001', 'name' => 'Industry Ltd', 'country' => 'NG',
            'team_size' => '11-50', 'use_case' => 'CRM', 'status' => 'active', 'activated_at' => now(),
        ]);
        $admin = User::factory()->create(['email_verified_at' => now()]);
        DB::table('company_users')->insert([
            'company_id' => $company->id, 'user_id' => $admin->id, 'role' => 'admin',
            'joined_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);
        $pipeline = LeadPipeline::query()->create([
            'company_id' => $company->id, 'name' => 'Default Pipeline', 'currency_code' => 'USD',
            'sort_order' => 0, 'is_default' => true,
        ]);

        return [$company, $admin, (int) $pipeline->id];
    }
}
