<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Admin;
use App\Models\Company;
use App\Models\ElyActionAudit;
use App\Models\PlatformSetting;
use App\Models\User;
use App\Services\AI\Agent\ElyEngineSelector;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

final class ElyAgentAdminTest extends TestCase
{
    use RefreshDatabase;

    public function test_page_shows_rollout_tools_and_audit_log(): void
    {
        $company = $this->company();
        $user = User::factory()->createOne();
        ElyActionAudit::query()->create([
            'company_id' => $company->id,
            'user_id' => $user->id,
            'role' => 'admin',
            'tool' => 'crm.create_lead',
            'outcome' => 'succeeded',
            'result' => ['summary' => "CRM lead 'Acme' was created successfully."],
        ]);

        $this->actingAs($this->admin('super_admin'), 'admin')
            ->get(route('admin.ai.ely'))
            ->assertOk()
            ->assertSee('Tool-calling engine')
            ->assertSee('crm.create_lead')
            ->assertSee("CRM lead 'Acme' was created successfully.")
            ->assertSee('Save rollout');
    }

    public function test_super_admin_can_enable_companies_and_selector_sees_them(): void
    {
        $company = $this->company();

        $this->actingAs($this->admin('super_admin'), 'admin')
            ->post(route('admin.ai.ely.rollout'), ['company_ids' => (string) $company->id])
            ->assertRedirect(route('admin.ai.ely'));

        $this->assertSame((string) $company->id, PlatformSetting::query()->where('key', ElyEngineSelector::COMPANY_IDS_KEY)->value('value'));
        $this->assertSame([(int) $company->id], app(ElyEngineSelector::class)->enabledCompanyIds());
    }

    public function test_unknown_company_ids_are_rejected(): void
    {
        $this->actingAs($this->admin('super_admin'), 'admin')
            ->from(route('admin.ai.ely'))
            ->post(route('admin.ai.ely.rollout'), ['company_ids' => '999999'])
            ->assertSessionHasErrors('company_ids');
    }

    public function test_non_super_admin_cannot_change_rollout(): void
    {
        $this->actingAs($this->admin('admin'), 'admin')
            ->post(route('admin.ai.ely.rollout'), ['company_ids' => '1'])
            ->assertForbidden();
    }

    private function admin(string $role): Admin
    {
        return Admin::create([
            'name' => 'Ops '.$role,
            'email' => Str::random(6).'@example.com',
            'password' => 'StrongPass123!',
            'role' => $role,
            'is_active' => true,
        ]);
    }

    private function company(): Company
    {
        return Company::query()->create([
            'company_id' => strtoupper(Str::random(10)),
            'name' => 'Factory '.Str::upper(Str::random(4)),
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Operations management',
            'status' => 'active',
            'activated_at' => now(),
        ]);
    }
}
