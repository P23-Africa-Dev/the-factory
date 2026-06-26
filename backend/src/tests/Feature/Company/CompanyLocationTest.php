<?php

declare(strict_types=1);

namespace Tests\Feature\Company;

use App\Models\Company;
use App\Models\CompanyLocation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CompanyLocationTest extends TestCase
{
    use RefreshDatabase;

    public function test_management_can_create_show_update_move_and_delete_location(): void
    {
        [$company, $admin] = $this->seedCompany('FAC-LOC001', 'Location Factory Ltd');

        $createResponse = $this->withToken($admin->createToken('admin-create-location', ['*'])->plainTextToken)
            ->postJson('/api/v1/admin/locations', [
                'company_id' => $company->id,
                'name' => 'Head Office',
                'type' => 'office',
                'description' => 'Corporate headquarters',
                'address' => '1 Main Street, Lagos',
                'latitude' => 6.4550000,
                'longitude' => 3.4000000,
                'contact_number' => '+2348000000000',
                'email' => 'office@example.com',
            ]);

        $createResponse->assertCreated()
            ->assertJsonPath('data.location.company_id', $company->id)
            ->assertJsonPath('data.location.name', 'Head Office')
            ->assertJsonPath('data.location.type', 'office')
            ->assertJsonPath('data.location.is_active', true)
            ->assertJsonPath('data.location.created_by.id', $admin->id);

        $locationId = (int) $createResponse->json('data.location.id');

        $showResponse = $this->withToken($admin->createToken('admin-show-location', ['*'])->plainTextToken)
            ->getJson('/api/v1/admin/locations/' . $locationId . '?company_id=' . $company->id);

        $showResponse->assertOk()
            ->assertJsonPath('data.location.id', $locationId);

        $updateResponse = $this->withToken($admin->createToken('admin-update-location', ['*'])->plainTextToken)
            ->patchJson('/api/v1/admin/locations/' . $locationId, [
                'company_id' => $company->id,
                'name' => 'Head Office (Updated)',
                'latitude' => 6.5000000,
                'longitude' => 3.5000000,
                'address' => '2 New Street, Lagos',
            ]);

        $updateResponse->assertOk()
            ->assertJsonPath('data.location.name', 'Head Office (Updated)')
            ->assertJsonPath('data.location.latitude', 6.5)
            ->assertJsonPath('data.location.longitude', 3.5);

        $this->assertDatabaseHas('company_locations', [
            'id' => $locationId,
            'updated_by_user_id' => $admin->id,
        ]);

        $deleteResponse = $this->withToken($admin->createToken('admin-delete-location', ['*'])->plainTextToken)
            ->deleteJson('/api/v1/admin/locations/' . $locationId, [
                'company_id' => $company->id,
            ]);

        $deleteResponse->assertOk()
            ->assertJsonPath('data.deleted_location_id', $locationId);

        $this->assertDatabaseMissing('company_locations', [
            'id' => $locationId,
        ]);
    }

    public function test_agent_can_create_and_list_locations(): void
    {
        [$company, , $agent] = $this->seedCompany('FAC-LOC002', 'Agent Location Ltd');

        $createResponse = $this->withToken($agent->createToken('agent-create-location', ['*'])->plainTextToken)
            ->postJson('/api/v1/agent/locations', [
                'company_id' => $company->id,
                'name' => 'Customer Site A',
                'type' => 'client_site',
                'latitude' => 6.6000000,
                'longitude' => 3.3000000,
            ]);

        $createResponse->assertCreated()
            ->assertJsonPath('data.location.name', 'Customer Site A')
            ->assertJsonPath('data.location.created_by.id', $agent->id);

        $listResponse = $this->withToken($agent->createToken('agent-list-location', ['*'])->plainTextToken)
            ->getJson('/api/v1/agent/locations?company_id=' . $company->id);

        $listResponse->assertOk()
            ->assertJsonPath('data.pagination.total', 1);
    }

    public function test_supervisor_can_edit_but_cannot_delete_location(): void
    {
        [$company, $admin, , $supervisor] = $this->seedCompany('FAC-LOC003', 'Supervisor Location Ltd');

        $location = CompanyLocation::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'name' => 'Warehouse',
            'type' => 'warehouse',
            'latitude' => 6.1000000,
            'longitude' => 3.1000000,
        ]);

        $editResponse = $this->withToken($supervisor->createToken('supervisor-edit-location', ['*'])->plainTextToken)
            ->patchJson('/api/v1/admin/locations/' . $location->id, [
                'company_id' => $company->id,
                'name' => 'Warehouse North',
            ]);

        $editResponse->assertOk()
            ->assertJsonPath('data.location.name', 'Warehouse North');

        $deleteResponse = $this->withToken($supervisor->createToken('supervisor-delete-location', ['*'])->plainTextToken)
            ->deleteJson('/api/v1/admin/locations/' . $location->id, [
                'company_id' => $company->id,
            ]);

        $deleteResponse->assertUnprocessable()
            ->assertJsonValidationErrors(['authorization']);
    }

    public function test_cross_company_user_can_view_location_with_stripped_fields(): void
    {
        [$company, $admin] = $this->seedCompany('FAC-LOC004', 'Tenant A Ltd');
        [$otherCompany, $otherAdmin] = $this->seedCompany('FAC-LOC005', 'Tenant B Ltd');

        $foreignLocation = CompanyLocation::create([
            'company_id' => $otherCompany->id,
            'created_by_user_id' => $otherAdmin->id,
            'name' => 'Foreign Office',
            'type' => 'office',
            'latitude' => 7.0000000,
            'longitude' => 4.0000000,
        ]);

        $showResponse = $this->withToken($admin->createToken('cross-show-location', ['*'])->plainTextToken)
            ->getJson('/api/v1/admin/locations/' . $foreignLocation->id . '?company_id=' . $company->id);

        $showResponse->assertOk()
            ->assertJsonPath('data.location.id', $foreignLocation->id)
            ->assertJsonPath('data.location.name', 'Foreign Office')
            ->assertJsonPath('data.location.can_manage', false)
            ->assertJsonMissingPath('data.location.company_id')
            ->assertJsonMissingPath('data.location.created_by')
            ->assertJsonMissingPath('data.location.linked_to_crm');

        $updateResponse = $this->withToken($admin->createToken('cross-update-location', ['*'])->plainTextToken)
            ->patchJson('/api/v1/admin/locations/' . $foreignLocation->id, [
                'company_id' => $company->id,
                'name' => 'Hijacked',
            ]);

        $updateResponse->assertUnprocessable()
            ->assertJsonValidationErrors(['location']);

        $deleteResponse = $this->withToken($admin->createToken('cross-delete-location', ['*'])->plainTextToken)
            ->deleteJson('/api/v1/admin/locations/' . $foreignLocation->id, [
                'company_id' => $company->id,
            ]);

        $deleteResponse->assertUnprocessable()
            ->assertJsonValidationErrors(['location']);

        $this->assertDatabaseHas('company_locations', [
            'id' => $foreignLocation->id,
            'company_id' => $otherCompany->id,
        ]);
    }

    public function test_global_list_shows_cross_company_pins_without_org_attribution(): void
    {
        [$companyA, $adminA] = $this->seedCompany('FAC-LOC007', 'Tenant Alpha Ltd');
        [$companyB, $adminB] = $this->seedCompany('FAC-LOC008', 'Tenant Beta Ltd');

        CompanyLocation::create([
            'company_id' => $companyA->id,
            'created_by_user_id' => $adminA->id,
            'name' => 'Alpha Pin',
            'type' => 'office',
            'latitude' => 6.1000000,
            'longitude' => 3.1000000,
        ]);

        $listResponse = $this->withToken($adminB->createToken('beta-list-global', ['*'])->plainTextToken)
            ->getJson('/api/v1/admin/locations?company_id=' . $companyB->id);

        $listResponse->assertOk()
            ->assertJsonPath('data.pagination.total', 1)
            ->assertJsonPath('data.items.0.name', 'Alpha Pin')
            ->assertJsonPath('data.items.0.can_manage', false)
            ->assertJsonMissingPath('data.items.0.company_id')
            ->assertJsonMissingPath('data.items.0.created_by');
    }

    public function test_own_company_sees_full_metadata_when_saved_to_crm(): void
    {
        [$company, $admin] = $this->seedCompany('FAC-LOC009', 'CRM Metadata Ltd');

        $createResponse = $this->withToken($admin->createToken('admin-crm-pin', ['*'])->plainTextToken)
            ->postJson('/api/v1/admin/locations', [
                'company_id' => $company->id,
                'name' => 'CRM Pin Site',
                'latitude' => 6.4400000,
                'longitude' => 3.4500000,
                'save_to_crm' => true,
            ]);

        $createResponse->assertCreated()
            ->assertJsonPath('data.location.linked_to_crm', true)
            ->assertJsonPath('data.location.company_id', $company->id)
            ->assertJsonPath('data.location.can_manage', true)
            ->assertJsonPath('data.location.created_by.id', $admin->id);
    }

    public function test_list_supports_search_and_type_filters(): void
    {
        [$company, $admin] = $this->seedCompany('FAC-LOC006', 'Search Location Ltd');

        CompanyLocation::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'name' => 'Murtala Airport',
            'type' => 'airport',
            'address' => 'Ikeja, Lagos',
            'latitude' => 6.5774000,
            'longitude' => 3.3211000,
        ]);

        CompanyLocation::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'name' => 'Mobil Filling Station',
            'type' => 'filling_station',
            'address' => 'Victoria Island',
            'latitude' => 6.4280000,
            'longitude' => 3.4210000,
        ]);

        $searchResponse = $this->withToken($admin->createToken('search-location', ['*'])->plainTextToken)
            ->getJson('/api/v1/admin/locations?company_id=' . $company->id . '&q=airport');

        $searchResponse->assertOk()
            ->assertJsonPath('data.pagination.total', 1)
            ->assertJsonPath('data.items.0.name', 'Murtala Airport');

        $typeResponse = $this->withToken($admin->createToken('type-location', ['*'])->plainTextToken)
            ->getJson('/api/v1/admin/locations?company_id=' . $company->id . '&type=filling_station');

        $typeResponse->assertOk()
            ->assertJsonPath('data.pagination.total', 1)
            ->assertJsonPath('data.items.0.name', 'Mobil Filling Station');
    }

    /**
     * @return array{0: Company, 1: User, 2: User, 3: User}
     */
    private function seedCompany(string $companyId, string $name): array
    {
        $company = Company::create([
            'company_id' => $companyId,
            'name' => $name,
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Location mapping',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $admin = User::factory()->create(['email_verified_at' => now()]);
        $agent = User::factory()->create(['email_verified_at' => now()]);
        $supervisor = User::factory()->create(['email_verified_at' => now()]);

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
            [
                'company_id' => $company->id,
                'user_id' => $supervisor->id,
                'role' => 'supervisor',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        return [$company, $admin, $agent, $supervisor];
    }
}
