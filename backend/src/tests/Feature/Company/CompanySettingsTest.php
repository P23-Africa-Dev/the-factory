<?php

declare(strict_types=1);

namespace Tests\Feature\Company;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\ActivatesCompanySubscription;
use Tests\TestCase;

class CompanySettingsTest extends TestCase
{
    use ActivatesCompanySubscription;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withBillingEnforcement();
    }

    public function test_management_user_can_fetch_company_settings(): void
    {
        ['user' => $owner, 'company' => $company] = $this->createCompanyWithOwner();
        $this->activateCompanySubscription($company);

        $response = $this->withToken($this->ownerToken($owner))
            ->getJson('/api/v1/company/settings?company_id=' . $company->id);

        $response->assertOk()
            ->assertJsonPath('data.company_id', $company->id)
            ->assertJsonPath('data.operational_defaults.minimum_photos_required', 1)
            ->assertJsonPath('data.meeting_defaults.default_reminder_minutes', 15)
            ->assertJsonPath('data.can_edit', true);
    }

    public function test_agent_can_view_but_not_update_company_settings(): void
    {
        ['company' => $company] = $this->createCompanyWithOwner();
        $this->activateCompanySubscription($company);

        $agent = User::factory()->create([
            'onboarding_completed_at' => now(),
        ]);
        $company->users()->attach($agent->id, [
            'role' => 'agent',
            'joined_at' => now(),
        ]);

        $this->withToken($this->ownerToken($agent))
            ->getJson('/api/v1/company/settings?company_id=' . $company->id)
            ->assertOk()
            ->assertJsonPath('data.can_edit', false);

        $this->withToken($this->ownerToken($agent))
            ->patchJson('/api/v1/company/settings', [
                'company_id' => $company->id,
                'operational_defaults' => ['minimum_photos_required' => 3],
            ])
            ->assertStatus(422);
    }

    public function test_supervisor_can_update_operational_defaults(): void
    {
        ['company' => $company] = $this->createCompanyWithOwner();
        $this->activateCompanySubscription($company);

        $supervisor = User::factory()->create([
            'onboarding_completed_at' => now(),
        ]);
        $company->users()->attach($supervisor->id, [
            'role' => 'supervisor',
            'joined_at' => now(),
        ]);

        $this->withToken($this->ownerToken($supervisor))
            ->patchJson('/api/v1/company/settings', [
                'company_id' => $company->id,
                'operational_defaults' => [
                    'minimum_photos_required' => 4,
                    'visit_verification_required' => true,
                ],
            ])
            ->assertOk()
            ->assertJsonPath('data.operational_defaults.minimum_photos_required', 4)
            ->assertJsonPath('data.operational_defaults.visit_verification_required', true);
    }
}
