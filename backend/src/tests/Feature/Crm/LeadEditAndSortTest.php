<?php

declare(strict_types=1);

namespace Tests\Feature\Crm;

use App\Models\Company;
use App\Models\CompanyLocation;
use App\Models\Lead;
use App\Models\LeadPipeline;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class LeadEditAndSortTest extends TestCase
{
    use RefreshDatabase;

    public function test_each_contact_keeps_its_position_and_profile_urls(): void
    {
        [$company, $admin,, $pipelineId] = $this->seedCompany();

        $leadId = (int) $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/crm/leads', [
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'name' => 'Oyi International',
                'company_name' => 'Oyi International',
                'status' => 'newly_lead',
                'priority' => 'medium',
                'contacts' => [
                    ['name' => 'Ann Lee', 'position' => 'CEO', 'profile_urls' => ['https://linkedin.com/in/ann']],
                    ['name' => 'Paul Kuan', 'position' => 'Sales Manager Assistant'],
                ],
            ])
            ->assertCreated()
            ->json('data.lead.id');

        // Read back: every contact carries its own position.
        $this->actingAs($admin, 'sanctum')
            ->getJson("/api/v1/crm/leads/{$leadId}?company_id={$company->id}")
            ->assertOk()
            ->assertJsonPath('data.lead.contacts.0.position', 'CEO')
            ->assertJsonPath('data.lead.contacts.0.profile_urls.0', 'https://linkedin.com/in/ann')
            ->assertJsonPath('data.lead.contacts.1.position', 'Sales Manager Assistant');

        // Edit contact 2's position; contact 1 keeps its own.
        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/v1/crm/leads/{$leadId}", [
                'company_id' => $company->id,
                'name' => 'Oyi International',
                'contacts' => [
                    ['name' => 'Ann Lee', 'position' => 'CEO', 'profile_urls' => ['https://linkedin.com/in/ann']],
                    ['name' => 'Paul Kuan', 'position' => 'Head of Sales'],
                ],
            ])
            ->assertOk()
            ->assertJsonPath('data.lead.name', 'Oyi International')
            ->assertJsonPath('data.lead.contacts.0.position', 'CEO')
            ->assertJsonPath('data.lead.contacts.1.position', 'Head of Sales');

        // The list endpoint returns them too (the list-page edit modal is seeded from it).
        $this->actingAs($admin, 'sanctum')
            ->getJson("/api/v1/crm/leads?company_id={$company->id}&pipeline_id={$pipelineId}")
            ->assertOk()
            ->assertJsonPath('data.items.0.contacts.1.position', 'Head of Sales');
    }

    public function test_budget_interaction_and_map_link_can_be_edited(): void
    {
        [$company, $admin,, $pipelineId] = $this->seedCompany();
        $lead = $this->lead($company, $admin, $pipelineId, ['name' => 'Map Lead']);
        $location = CompanyLocation::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'name' => 'Ikeja Office',
            'latitude' => 6.6,
            'longitude' => 3.35,
        ]);

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/v1/crm/leads/{$lead->id}", [
                'company_id' => $company->id,
                'budget_amount' => 25000,
                'budget_currency' => 'NGN',
                'last_interaction' => 'Sent invoice',
                'last_interaction_at' => '2026-11-20T10:30:00Z',
                'company_location_id' => $location->id,
            ])
            ->assertOk()
            ->assertJsonPath('data.lead.budget_currency', 'NGN')
            ->assertJsonPath('data.lead.last_interaction', 'Sent invoice')
            ->assertJsonPath('data.lead.company_location_id', $location->id)
            ->assertJsonPath('data.lead.linked_to_map', true);

        $this->assertEquals(25000.0, (float) $lead->fresh()->budget_amount);
        $this->assertSame($lead->id, (int) $location->fresh()->crm_lead_id);
        // Linking must not overwrite the pin's own details.
        $this->assertSame('Ikeja Office', $location->fresh()->name);

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/v1/crm/leads/{$lead->id}", [
                'company_id' => $company->id,
                'company_location_id' => null,
            ])
            ->assertOk()
            ->assertJsonPath('data.lead.linked_to_map', false);

        $this->assertNull($location->fresh()->crm_lead_id);
    }

    public function test_map_link_rejects_location_from_another_company(): void
    {
        [$company, $admin,, $pipelineId] = $this->seedCompany();
        $lead = $this->lead($company, $admin, $pipelineId, ['name' => 'Map Lead']);
        $otherCompany = Company::create([
            'company_id' => 'FAC-OTHER1',
            'name' => 'Other Ltd',
            'country' => 'NG',
            'team_size' => '1-10',
            'use_case' => 'CRM',
            'status' => 'active',
            'activated_at' => now(),
        ]);
        $foreign = CompanyLocation::create([
            'company_id' => $otherCompany->id,
            'created_by_user_id' => $admin->id,
            'name' => 'Elsewhere',
            'latitude' => 1,
            'longitude' => 1,
        ]);

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/v1/crm/leads/{$lead->id}", [
                'company_id' => $company->id,
                'company_location_id' => $foreign->id,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('company_location_id');
    }

    public function test_import_update_assigns_unassigned_lead_to_importer(): void
    {
        [$company, $admin,, $pipelineId] = $this->seedCompany();
        $lead = $this->lead($company, $admin, $pipelineId, [
            'name' => 'Nobody Owns Me',
            'email' => 'nobody@example.com',
            'assigned_to_user_id' => null,
        ]);

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/crm/leads/import', [
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'duplicate_policy' => 'update',
                'rows' => [['name' => 'Nobody Owns Me', 'email' => 'nobody@example.com']],
            ])
            ->assertOk()
            ->assertJsonPath('data.updated_count', 1);

        $this->assertSame($admin->id, (int) $lead->fresh()->assigned_to_user_id);
    }

    public function test_import_new_rows_default_to_importer(): void
    {
        [$company, $admin,, $pipelineId] = $this->seedCompany();

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/crm/leads/import', [
                'company_id' => $company->id,
                'pipeline_id' => $pipelineId,
                'rows' => [['name' => 'Fresh Import', 'email' => 'fresh@example.com']],
            ])
            ->assertOk();

        $this->assertDatabaseHas('leads', [
            'email' => 'fresh@example.com',
            'created_by_user_id' => $admin->id,
            'assigned_to_user_id' => $admin->id,
        ]);
    }

    public function test_lead_list_sorts(): void
    {
        [$company, $admin,, $pipelineId] = $this->seedCompany();
        $old = $this->lead($company, $admin, $pipelineId, ['name' => 'Bravo', 'budget_amount' => 500, 'priority' => 'low']);
        $mid = $this->lead($company, $admin, $pipelineId, ['name' => 'Alpha', 'budget_amount' => null, 'priority' => 'urgent']);
        $new = $this->lead($company, $admin, $pipelineId, ['name' => 'Charlie', 'budget_amount' => 9000, 'priority' => 'medium']);
        DB::table('leads')->where('id', $old->id)->update(['created_at' => '2026-01-01 00:00:00', 'updated_at' => '2026-01-01 00:00:00']);
        DB::table('leads')->where('id', $mid->id)->update(['created_at' => '2026-02-01 00:00:00', 'updated_at' => '2026-02-01 00:00:00']);
        DB::table('leads')->where('id', $new->id)->update(['created_at' => '2026-03-01 00:00:00', 'updated_at' => '2026-03-01 00:00:00']);

        $ids = fn (string $sort): array => array_map(
            'intval',
            array_column(
                $this->actingAs($admin, 'sanctum')
                    ->getJson("/api/v1/crm/leads?company_id={$company->id}&pipeline_id={$pipelineId}&sort={$sort}")
                    ->assertOk()
                    ->json('data.items'),
                'id',
            ),
        );

        $this->assertSame([$new->id, $mid->id, $old->id], $ids('newest'));
        $this->assertSame([$old->id, $mid->id, $new->id], $ids('oldest'));
        $this->assertSame([$new->id, $old->id, $mid->id], $ids('budget_desc'));
        $this->assertSame([$old->id, $new->id, $mid->id], $ids('budget_asc'));
        $this->assertSame([$mid->id, $old->id, $new->id], $ids('name_asc'));
        $this->assertSame([$mid->id, $new->id, $old->id], $ids('priority'));

        // Logging activity on the oldest lead brings it to the top of "recent activity".
        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/crm/leads/{$old->id}/activities", [
                'company_id' => $company->id,
                'type' => 'call',
                'title' => 'Follow-up call',
            ])
            ->assertCreated();

        $this->assertSame($old->id, $ids('recent_activity')[0]);

        $this->actingAs($admin, 'sanctum')
            ->getJson("/api/v1/crm/leads?company_id={$company->id}&sort=bogus")
            ->assertStatus(422);
    }

    /**
     * @return array{0: Company, 1: User, 2: User, 3: int}
     */
    private function seedCompany(): array
    {
        $company = Company::create([
            'company_id' => 'FAC-SORT01',
            'name' => 'Sort Factory Ltd',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'CRM management',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $admin = User::factory()->create(['email_verified_at' => now()]);
        $agent = User::factory()->create(['email_verified_at' => now()]);

        foreach ([[$admin, 'admin'], [$agent, 'agent']] as [$user, $role]) {
            DB::table('company_users')->insert([
                'company_id' => $company->id,
                'user_id' => $user->id,
                'role' => $role,
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $pipeline = LeadPipeline::query()->create([
            'company_id' => $company->id,
            'name' => 'Default Pipeline',
            'currency_code' => 'USD',
            'sort_order' => 0,
            'is_default' => true,
        ]);

        return [$company, $admin, $agent, $pipeline->id];
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function lead(Company $company, User $creator, int $pipelineId, array $attributes): Lead
    {
        return Lead::create([
            'company_id' => $company->id,
            'pipeline_id' => $pipelineId,
            'created_by_user_id' => $creator->id,
            'assigned_to_user_id' => $creator->id,
            'status' => 'newly_lead',
            'priority' => 'medium',
            ...$attributes,
        ]);
    }
}
