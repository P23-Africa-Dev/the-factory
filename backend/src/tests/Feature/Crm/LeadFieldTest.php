<?php

declare(strict_types=1);

namespace Tests\Feature\Crm;

use App\Models\Company;
use App\Models\Lead;
use App\Models\LeadFieldDefinition;
use App\Models\LeadPipeline;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class LeadFieldTest extends TestCase
{
    use RefreshDatabase;

    public function test_default_field_is_lead_only_and_title_cased(): void
    {
        [$company, $admin] = $this->seedCompanyUsers();

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/crm/lead-fields', [
                'company_id' => $company->id,
                'label' => 'phone number',
                'type' => 'text',
            ])
            ->assertCreated()
            ->assertJsonPath('data.field.key', 'phone_number')
            ->assertJsonPath('data.field.label', 'Phone Number')
            ->assertJsonPath('data.field.status', 'active')
            ->assertJsonPath('data.field.is_universal', false)
            ->assertJsonPath('data.field.show_on_create', false)
            ->assertJsonPath('data.field.show_in_list', false)
            ->assertJsonPath('data.field.universal_request_status', null);
    }

    public function test_manager_can_create_universal_required_field(): void
    {
        [$company, $admin, , $pipelineId] = $this->seedCompanyUsers();

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/crm/lead-fields', [
                'company_id' => $company->id,
                'label' => 'headcount',
                'type' => 'number',
                'make_universal' => true,
                'is_required' => true,
            ])
            ->assertCreated()
            ->assertJsonPath('data.field.label', 'Headcount')
            ->assertJsonPath('data.field.is_universal', true)
            ->assertJsonPath('data.field.show_on_create', true)
            ->assertJsonPath('data.field.is_required', true)
            ->assertJsonPath('data.field.universal_request_status', 'approved');

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/crm/leads', [
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'name' => 'Missing Headcount',
                'status' => 'newly_lead',
                'priority' => 'low',
            ])
            ->assertStatus(422);
    }

    public function test_agent_universal_request_stays_lead_only_until_review(): void
    {
        [$company, $admin, $agent, $pipelineId] = $this->seedCompanyUsers();

        $pending = $this->actingAs($agent, 'sanctum')
            ->postJson('/api/v1/crm/lead-fields', [
                'company_id' => $company->id,
                'label' => 'region code',
                'type' => 'text',
                'make_universal' => true,
                'is_required' => true,
            ]);

        $pending->assertCreated()
            ->assertJsonPath('data.field.key', 'region_code')
            ->assertJsonPath('data.field.label', 'Region Code')
            ->assertJsonPath('data.field.status', 'active')
            ->assertJsonPath('data.field.is_universal', false)
            ->assertJsonPath('data.field.show_on_create', false)
            ->assertJsonPath('data.field.is_required', false)
            ->assertJsonPath('data.field.universal_request_status', 'pending');

        $fieldId = (int) $pending->json('data.field.id');

        $this->assertDatabaseHas('app_notifications', [
            'user_id' => $admin->id,
            'company_id' => $company->id,
            'type' => 'crm.lead_field_pending',
            'reference_id' => $fieldId,
        ]);

        $this->actingAs($agent, 'sanctum')
            ->postJson('/api/v1/crm/leads', [
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'name' => 'Agent Lead',
                'status' => 'newly_lead',
                'priority' => 'medium',
                'custom_fields' => ['region_code' => 'west'],
            ])
            ->assertCreated()
            ->assertJsonPath('data.lead.custom_fields.region_code', 'west');

        // Another lead is not blocked; the field is not universal/required yet.
        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/crm/leads', [
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'name' => 'Other Lead',
                'status' => 'newly_lead',
                'priority' => 'medium',
            ])
            ->assertCreated();

        $this->actingAs($agent, 'sanctum')
            ->postJson('/api/v1/crm/lead-fields/'.$fieldId.'/approve', [
                'company_id' => $company->id,
            ])
            ->assertStatus(422)
            ->assertJsonPath('errors.authorization.0', 'Only owners, admins, and supervisors can review lead fields.');

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/crm/lead-fields/'.$fieldId.'/approve', [
                'company_id' => $company->id,
            ])
            ->assertOk()
            ->assertJsonPath('data.field.is_universal', true)
            ->assertJsonPath('data.field.show_on_create', true)
            ->assertJsonPath('data.field.universal_request_status', 'approved');
    }

    public function test_decline_keeps_stored_value_on_existing_lead(): void
    {
        [$company, $admin, $agent, $pipelineId] = $this->seedCompanyUsers();

        $fieldId = (int) $this->actingAs($agent, 'sanctum')
            ->postJson('/api/v1/crm/lead-fields', [
                'company_id' => $company->id,
                'label' => 'Industry Segment',
                'type' => 'select',
                'options' => ['SaaS', 'Retail'],
                'make_universal' => true,
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
                'custom_fields' => ['industry_segment' => 'SaaS'],
            ])
            ->assertCreated()
            ->assertJsonPath('data.lead.custom_fields.industry_segment', 'saas')
            ->json('data.lead.id');

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
            ->postJson('/api/v1/crm/lead-fields/'.$fieldId.'/decline', [
                'company_id' => $company->id,
                'reason' => 'Not needed company-wide',
            ])
            ->assertOk()
            ->assertJsonPath('data.field.status', 'active')
            ->assertJsonPath('data.field.is_universal', false)
            ->assertJsonPath('data.field.universal_request_status', 'declined');

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/crm/leads/'.$leadId.'?company_id='.$company->id)
            ->assertOk()
            ->assertJsonPath('data.lead.custom_fields.industry_segment', 'saas');

        $this->assertSame('saas', Lead::query()->find($leadId)?->custom_fields['industry_segment'] ?? null);
    }

    public function test_import_accepts_custom_values_and_rejects_invalid_types(): void
    {
        [$company, $admin, , $pipelineId] = $this->seedCompanyUsers();

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/crm/lead-fields', [
                'company_id' => $company->id,
                'label' => 'Headcount',
                'type' => 'number',
                'make_universal' => true,
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

    public function test_manager_can_reorder_and_delete_fields(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();

        $firstId = (int) $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/crm/lead-fields', [
                'company_id' => $company->id,
                'label' => 'Alpha Field',
                'type' => 'text',
                'make_universal' => true,
            ])
            ->assertCreated()
            ->json('data.field.id');

        $secondId = (int) $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/crm/lead-fields', [
                'company_id' => $company->id,
                'label' => 'Beta Field',
                'type' => 'text',
            ])
            ->assertCreated()
            ->json('data.field.id');

        $this->actingAs($agent, 'sanctum')
            ->postJson('/api/v1/crm/lead-fields/reorder', [
                'company_id' => $company->id,
                'ordered_ids' => [$secondId, $firstId],
            ])
            ->assertStatus(422);

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/crm/lead-fields/reorder', [
                'company_id' => $company->id,
                'ordered_ids' => [$secondId, $firstId],
            ])
            ->assertOk()
            ->assertJsonPath('data.items.0.id', $secondId)
            ->assertJsonPath('data.items.1.id', $firstId);

        $this->assertSame(1, (int) LeadFieldDefinition::query()->find($secondId)?->sort_order);
        $this->assertSame(2, (int) LeadFieldDefinition::query()->find($firstId)?->sort_order);

        $this->actingAs($agent, 'sanctum')
            ->deleteJson('/api/v1/crm/lead-fields/'.$firstId, [
                'company_id' => $company->id,
            ])
            ->assertStatus(422);

        $this->actingAs($admin, 'sanctum')
            ->deleteJson('/api/v1/crm/lead-fields/'.$firstId, [
                'company_id' => $company->id,
            ])
            ->assertOk();

        $this->assertDatabaseMissing('lead_field_definitions', ['id' => $firstId]);
    }

    public function test_manager_rename_applies_title_case(): void
    {
        [$company, $admin] = $this->seedCompanyUsers();

        $fieldId = (int) $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/crm/lead-fields', [
                'company_id' => $company->id,
                'label' => 'agro-processing note',
                'type' => 'text',
            ])
            ->assertCreated()
            ->assertJsonPath('data.field.label', 'Agro-Processing Note')
            ->json('data.field.id');

        $this->actingAs($admin, 'sanctum')
            ->patchJson('/api/v1/crm/lead-fields/'.$fieldId, [
                'company_id' => $company->id,
                'label' => 'PHONE NUMBER',
            ])
            ->assertOk()
            ->assertJsonPath('data.field.label', 'Phone Number');
    }

    /**
     * @return array{0: Company, 1: User, 2: User, 3: int}
     */
    public function test_import_does_not_register_blank_values_but_still_flags_required_ones(): void
    {
        [$company, $admin, , $pipelineId] = $this->seedCompanyUsers();

        // Lead-only (this import) field.
        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/crm/lead-fields', [
                'company_id' => $company->id,
                'label' => 'Referral Code',
                'type' => 'text',
            ])
            ->assertCreated()
            ->assertJsonPath('data.field.is_universal', false);

        // Required company-wide field.
        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/crm/lead-fields', [
                'company_id' => $company->id,
                'label' => 'Headcount',
                'type' => 'number',
                'make_universal' => true,
                'is_required' => true,
            ])
            ->assertCreated();

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/crm/leads/import', [
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'duplicate_policy' => 'create',
                'rows' => [
                    [
                        'name' => 'With Code',
                        'email' => 'with@example.com',
                        'custom_fields' => ['referral_code' => 'ABC', 'headcount' => '5'],
                    ],
                    [
                        'name' => 'Blank Code',
                        'email' => 'blank@example.com',
                        'custom_fields' => ['referral_code' => '', 'headcount' => '7'],
                    ],
                    [
                        'name' => 'Blank Required',
                        'email' => 'required@example.com',
                        'custom_fields' => ['headcount' => ''],
                    ],
                ],
            ])
            ->assertOk()
            ->assertJsonPath('data.imported_count', 2)
            ->assertJsonPath('data.failed_rows.0.data.name', 'Blank Required');

        $withCode = Lead::query()->where('email', 'with@example.com')->firstOrFail();
        $this->assertSame('ABC', $withCode->custom_fields['referral_code'] ?? null);

        $blank = Lead::query()->where('email', 'blank@example.com')->firstOrFail();
        $this->assertArrayNotHasKey('referral_code', $blank->custom_fields ?? []);
    }

    public function test_manager_field_list_shows_how_many_leads_use_a_pending_request(): void
    {
        [$company, $admin, $agent, $pipelineId] = $this->seedCompanyUsers();

        $this->actingAs($agent, 'sanctum')
            ->postJson('/api/v1/crm/lead-fields', [
                'company_id' => $company->id,
                'label' => 'Founded',
                'type' => 'text',
                'make_universal' => true,
            ])
            ->assertCreated()
            ->assertJsonPath('data.field.universal_request_status', 'pending');

        foreach (['2019', '2021'] as $index => $year) {
            $this->actingAs($agent, 'sanctum')
                ->postJson('/api/v1/crm/leads', [
                    'company_id' => $company->id,
                    'pipeline_id' => $pipelineId,
                    'name' => 'Startup ' . $index,
                    'status' => 'newly_lead',
                    'priority' => 'medium',
                    'custom_fields' => ['founded' => $year],
                ])
                ->assertCreated();
        }

        // A lead without the field does not count.
        $this->actingAs($agent, 'sanctum')
            ->postJson('/api/v1/crm/leads', [
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'name' => 'No Founded',
                'status' => 'newly_lead',
                'priority' => 'medium',
            ])
            ->assertCreated();

        $this->app['auth']->forgetGuards();
        $items = collect($this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/crm/lead-fields?company_id=' . $company->id)
            ->assertOk()
            ->json('data.items'));

        $founded = $items->firstWhere('key', 'founded');
        $this->assertSame(2, $founded['usage_count']);
        $this->assertNotNull($founded['created_at']);
    }

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
        ]);

        return [$company, $admin, $agent, (int) $pipeline->id];
    }
}
