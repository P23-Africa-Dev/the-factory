<?php

declare(strict_types=1);

namespace Tests\Feature\Company;

use App\Models\Company;
use App\Models\CompanyLocation;
use App\Models\Lead;
use App\Models\LeadPipeline;
use App\Models\User;
use App\Services\Crm\MapSavedLeadBridgeService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class MapSavedLocationCrmTest extends TestCase
{
    use RefreshDatabase;

    public function test_save_to_crm_creates_map_pipeline_lead_and_link(): void
    {
        [$company, $admin] = $this->seedCompany();

        $response = $this->withToken($admin->createToken('admin-map-crm', ['*'])->plainTextToken)
            ->postJson('/api/v1/admin/locations', [
                'company_id' => $company->id,
                'name' => 'Prospect Site',
                'type' => 'office',
                'address' => '12 Admiralty Way, Lagos',
                'latitude' => 6.4400000,
                'longitude' => 3.4500000,
                'contact_number' => '+2348012345678',
                'email' => 'site@example.com',
                'save_to_crm' => true,
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.location.linked_to_crm', true)
            ->assertJsonPath('data.location.name', 'Prospect Site');

        $locationId = (int) $response->json('data.location.id');
        $leadId = (int) $response->json('data.location.crm_lead_id');

        $this->assertDatabaseHas('company_locations', [
            'id' => $locationId,
            'crm_lead_id' => $leadId,
        ]);

        $this->assertDatabaseHas('leads', [
            'id' => $leadId,
            'company_location_id' => $locationId,
            'name' => 'Prospect Site',
            'source' => MapSavedLeadBridgeService::MAP_LEAD_SOURCE,
        ]);

        $pipeline = LeadPipeline::query()
            ->where('company_id', $company->id)
            ->where('system_key', MapSavedLeadBridgeService::MAP_PIPELINE_SYSTEM_KEY)
            ->first();

        $this->assertNotNull($pipeline);
        $this->assertSame('Map Leads', $pipeline->name);
        $this->assertSame($pipeline->id, Lead::query()->findOrFail($leadId)->pipeline_id);
    }

    public function test_map_pipeline_is_hidden_until_a_map_crm_lead_exists(): void
    {
        [$company, $admin] = $this->seedCompany();

        $before = $this->withToken($admin->createToken('admin-pipelines-before', ['*'])->plainTextToken)
            ->getJson('/api/v1/admin/crm/pipelines?company_id=' . $company->id);

        $before->assertOk();
        $beforeNames = collect($before->json('data.items'))->pluck('name')->all();
        $this->assertNotContains('Map Leads', $beforeNames);

        $this->withToken($admin->createToken('admin-map-crm-create', ['*'])->plainTextToken)
            ->postJson('/api/v1/admin/locations', [
                'company_id' => $company->id,
                'name' => 'CRM Pin',
                'latitude' => 6.4400000,
                'longitude' => 3.4500000,
                'save_to_crm' => true,
            ])
            ->assertCreated();

        $after = $this->withToken($admin->createToken('admin-pipelines-after', ['*'])->plainTextToken)
            ->getJson('/api/v1/admin/crm/pipelines?company_id=' . $company->id);

        $after->assertOk();
        $afterNames = collect($after->json('data.items'))->pluck('name')->all();
        $this->assertContains('Map Leads', $afterNames);
    }

    public function test_location_update_syncs_linked_crm_lead_and_delete_unlinks_only(): void
    {
        [$company, $admin] = $this->seedCompany();

        $create = $this->withToken($admin->createToken('admin-create-linked', ['*'])->plainTextToken)
            ->postJson('/api/v1/admin/locations', [
                'company_id' => $company->id,
                'name' => 'Linked Site',
                'address' => 'Old address',
                'latitude' => 6.4400000,
                'longitude' => 3.4500000,
                'save_to_crm' => true,
            ]);

        $locationId = (int) $create->json('data.location.id');
        $leadId = (int) $create->json('data.location.crm_lead_id');

        $this->withToken($admin->createToken('admin-update-linked', ['*'])->plainTextToken)
            ->patchJson('/api/v1/admin/locations/' . $locationId, [
                'company_id' => $company->id,
                'name' => 'Linked Site Updated',
                'address' => 'New address',
            ])
            ->assertOk();

        $this->assertDatabaseHas('leads', [
            'id' => $leadId,
            'name' => 'Linked Site Updated',
            'location' => 'New address',
        ]);

        $this->withToken($admin->createToken('admin-delete-location', ['*'])->plainTextToken)
            ->deleteJson('/api/v1/admin/locations/' . $locationId, [
                'company_id' => $company->id,
            ])
            ->assertOk();

        $this->assertDatabaseMissing('company_locations', ['id' => $locationId]);
        $this->assertDatabaseHas('leads', [
            'id' => $leadId,
            'name' => 'Linked Site Updated',
            'company_location_id' => null,
        ]);
    }

    public function test_crm_lead_update_syncs_linked_map_location(): void
    {
        [$company, $admin] = $this->seedCompany();

        $create = $this->withToken($admin->createToken('admin-create-sync', ['*'])->plainTextToken)
            ->postJson('/api/v1/admin/locations', [
                'company_id' => $company->id,
                'name' => 'Sync Site',
                'address' => 'Original address',
                'latitude' => 6.4400000,
                'longitude' => 3.4500000,
                'save_to_crm' => true,
            ]);

        $locationId = (int) $create->json('data.location.id');
        $leadId = (int) $create->json('data.location.crm_lead_id');

        $this->withToken($admin->createToken('admin-update-lead', ['*'])->plainTextToken)
            ->patchJson('/api/v1/admin/crm/leads/' . $leadId, [
                'company_id' => $company->id,
                'name' => 'CRM Renamed Site',
                'phone' => '+2348099999999',
                'location' => 'CRM address update',
            ])
            ->assertOk();

        $this->assertDatabaseHas('company_locations', [
            'id' => $locationId,
            'name' => 'CRM Renamed Site',
            'contact_number' => '+2348099999999',
            'address' => 'CRM address update',
        ]);
    }

    /**
     * @return array{0: Company, 1: User}
     */
    private function seedCompany(): array
    {
        $company = Company::create([
            'company_id' => 'FAC-MAPCRM01',
            'name' => 'Map CRM Factory Ltd',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Map CRM',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $admin = User::factory()->create(['email_verified_at' => now()]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $admin->id,
            'role' => 'admin',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return [$company, $admin];
    }
}
