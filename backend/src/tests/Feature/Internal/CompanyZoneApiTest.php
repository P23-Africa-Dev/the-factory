<?php

declare(strict_types=1);

namespace Tests\Feature\Internal;

use App\Models\Company;
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
