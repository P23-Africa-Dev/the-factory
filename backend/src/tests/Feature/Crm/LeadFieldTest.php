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

class LeadFieldTest extends TestCase
{
    use RefreshDatabase;

    public function test_manager_field_is_active_and_agent_field_stays_pending_until_review(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/crm/lead-fields', [
                'company_id' => $company->id,
                'label' => 'Industry',
                'type' => 'text',
            ])
            ->assertCreated()
            ->assertJsonPath('data.field.key', 'industry')
            ->assertJsonPath('data.field.status', 'active')
            ->assertJsonPath('data.field.show_in_list', true);

        $pending = $this->actingAs($agent, 'sanctum')
            ->postJson('/api/v1/crm/lead-fields', [
                'company_id' => $company->id,
                'label' => 'Headcount',
                'type' => 'number',
                'status' => 'active',
            ]);

        $pending->assertCreated()
            ->assertJsonPath('data.field.key', 'headcount')
            ->assertJsonPath('data.field.status', 'pending');

        $fieldId = (int) $pending->json('data.field.id');

        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $admin->id,
            'company_id' => $company->id,
            'type' => 'crm.lead_field_pending',
            'reference_id' => $fieldId,
        ]);

        $this->actingAs($agent, 'sanctum')
            ->postJson('/api/v1/crm/lead-fields/'.$fieldId.'/approve', [
                'company_id' => $company->id,
            ])
            ->assertStatus(422)
            ->assertJsonPath('errors.authorization.0', 'Only owners, admins, and supervisors can review lead fields.');

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/crm/lead-fields?company_id='.$company->id)
            ->assertOk()
            ->assertJsonFragment(['key' => 'industry', 'status' => 'active'])
            ->assertJsonFragment(['key' => 'headcount', 'status' => 'pending']);
    }

    public function test_custom_field_values_follow_approval_and_reject_unknown_keys(): void
    {
        [$company, $admin, $agent, $pipelineId] = $this->seedCompanyUsers();

        $fieldId = (int) $this->actingAs($agent, 'sanctum')
            ->postJson('/api/v1/crm/lead-fields', [
                'company_id' => $company->id,
                'label' => 'Industry',
                'type' => 'select',
                'options' => ['SaaS', 'Retail'],
            ])
            ->assertCreated()
            ->json('data.field.id');

        $leadId = (int) $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/crm/leads', [
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'name' => 'Northwind',
                'status' => 'newly_lead',
                'priority' => 'medium',
                'custom_fields' => ['industry' => 'SaaS'],
            ])
            ->assertCreated()
            ->assertJsonPath('data.lead.custom_fields.industry', 'saas')
            ->json('data.lead.id');

        $this->assertNotNull(Lead::query()->find($leadId)?->custom_fields['industry'] ?? null);

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/crm/leads', [
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'name' => 'Unknown Field',
                'status' => 'newly_lead',
                'priority' => 'medium',
                'custom_fields' => ['not_a_field' => 'nope'],
            ])
            ->assertStatus(422);

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/crm/leads?company_id='.$company->id.'&search=SaaS')
            ->assertOk()
            ->assertJsonPath('data.items.0.id', $leadId);

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/crm/lead-fields/'.$fieldId.'/decline', [
                'company_id' => $company->id,
                'reason' => 'Not needed',
            ])
            ->assertOk()
            ->assertJsonPath('data.field.status', 'declined');

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/crm/leads/'.$leadId.'?company_id='.$company->id)
            ->assertOk()
            ->assertJsonMissingPath('data.lead.custom_fields.industry');

        $this->assertSame('saas', Lead::query()->find($leadId)?->custom_fields['industry'] ?? null);

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/crm/lead-fields/'.$fieldId.'/approve', [
                'company_id' => $company->id,
            ])
            ->assertOk()
            ->assertJsonPath('data.field.status', 'active');

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/crm/leads/'.$leadId.'?company_id='.$company->id)
            ->assertOk()
            ->assertJsonPath('data.lead.custom_fields.industry', 'saas');
    }

    public function test_import_accepts_custom_values_and_rejects_invalid_types(): void
    {
        [$company, $admin, , $pipelineId] = $this->seedCompanyUsers();

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/crm/lead-fields', [
                'company_id' => $company->id,
                'label' => 'Headcount',
                'type' => 'number',
                'is_required' => true,
            ])
            ->assertCreated();

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/crm/leads', [
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'name' => 'Missing Headcount',
                'status' => 'newly_lead',
                'priority' => 'low',
            ])
            ->assertStatus(422);

        $imported = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/crm/leads/import', [
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'duplicate_policy' => 'create',
                'rows' => [
                    [
                        'name' => 'Imported Co',
                        'email' => 'imported@example.com',
                        'status' => 'newly_lead',
                        'priority' => 'medium',
                        'custom_fields' => ['headcount' => '40'],
                    ],
                    [
                        'name' => 'Bad Count',
                        'email' => 'bad@example.com',
                        'status' => 'newly_lead',
                        'priority' => 'medium',
                        'custom_fields' => ['headcount' => 'many'],
                    ],
                    [
                        'name' => 'Unmapped Required',
                        'email' => 'plain@example.com',
                        'status' => 'newly_lead',
                        'priority' => 'medium',
                    ],
                ],
            ]);

        $imported->assertOk()
            ->assertJsonPath('data.imported_count', 2)
            ->assertJsonPath('data.failed_rows.0.data.name', 'Bad Count');

        $this->assertDatabaseHas('leads', [
            'company_id' => $company->id,
            'email' => 'imported@example.com',
        ]);

        $lead = Lead::query()->where('email', 'imported@example.com')->first();
        $this->assertSame(40, $lead?->custom_fields['headcount'] ?? null);
    }

    /**
     * @return array{0: Company, 1: User, 2: User, 3: int}
     */
    private function seedCompanyUsers(): array
    {
        $company = Company::create([
            'company_id' => 'FAC-FIELDS',
            'name' => 'Fields Factory Ltd',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'CRM management',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $admin = User::factory()->create(['email_verified_at' => now()]);
        $agent = User::factory()->create(['email_verified_at' => now()]);

        DB::table('company_users')->insert([
            [
                'company_id' => $company->id,
                'user_id' => $admin->id,
                'role' => 'admin',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'company_id' => $company->id,
                'user_id' => $agent->id,
                'role' => 'agent',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        $pipeline = LeadPipeline::query()->create([
            'company_id' => $company->id,
            'name' => 'Default Pipeline',
            'currency_code' => 'USD',
            'sort_order' => 0,
            'is_default' => true,
        ]);

        return [$company, $admin, $agent, $pipeline->id];
    }
}
