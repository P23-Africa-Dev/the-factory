<?php

declare(strict_types=1);

namespace Tests\Feature\Internal;

use App\Models\Company;
use App\Models\CompanyZone;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CompanyZoneApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_management_can_create_company_zone(): void
    {
        [$company, $owner] = $this->seedCompanyOwner();

        $response = $this->actingAs($owner, 'sanctum')
            ->postJson('/api/v1/internal-users/zones', [
                'company_id' => $company->id,
                'country_code' => 'NG',
                'state_name' => 'Lagos',
                'lga_name' => 'Ikeja',
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.zone.country_code', 'NG')
            ->assertJsonPath('data.zone.state_name', 'Lagos')
            ->assertJsonPath('data.zone.lga_name', 'Ikeja');

        $this->assertDatabaseHas('company_zones', [
            'company_id' => $company->id,
            'country_code' => 'NG',
            'state_name' => 'Lagos',
            'lga_name' => 'Ikeja',
        ]);
    }

    public function test_agent_can_list_company_zones_but_cannot_create_zone(): void
    {
        [$company, $owner] = $this->seedCompanyOwner();

        $agent = User::factory()->create([
            'internal_role' => 'agent',
            'is_active' => true,
        ]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'role' => 'agent',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        CompanyZone::query()->create([
            'company_id' => $company->id,
            'name' => 'Ikeja, Lagos',
            'normalized_name' => 'ikeja, lagos',
            'country_code' => 'NG',
            'state_name' => 'Lagos',
            'lga_name' => 'Ikeja',
            'is_active' => true,
            'created_by_user_id' => $owner->id,
        ]);

        $this->actingAs($agent, 'sanctum')
            ->getJson('/api/v1/internal-users/zones?company_id='.$company->id.'&is_active=1')
            ->assertOk()
            ->assertJsonPath('data.0.country_code', 'NG');

        $this->actingAs($agent, 'sanctum')
            ->postJson('/api/v1/internal-users/zones', [
                'company_id' => $company->id,
                'country_code' => 'NG',
                'state_name' => 'Lagos',
                'lga_name' => 'Yaba',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['authorization']);
    }

    /**
     * @return array{0: Company, 1: User}
     */
    private function seedCompanyOwner(): array
    {
        $company = Company::create([
            'company_id' => 'FAC-ZONE-' . strtoupper((string) fake()->lexify('????')),
            'name' => 'Zone Co',
            'country' => 'NG',
            'currency_code' => 'NGN',
            'team_size' => '11-50',
            'use_case' => 'Zone testing',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $owner = User::factory()->create([
            'internal_role' => 'admin',
            'is_active' => true,
        ]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $owner->id,
            'role' => 'owner',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return [$company, $owner];
    }
}
