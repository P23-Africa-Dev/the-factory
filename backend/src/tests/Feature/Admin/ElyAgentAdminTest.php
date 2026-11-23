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

    public function test_rollout_accepts_a_checkbox_array_of_ids(): void
    {
        $a = $this->company();
        $b = $this->company();

        $this->actingAs($this->admin('super_admin'), 'admin')
            ->post(route('admin.ai.ely.rollout'), ['company_ids' => [$a->id, $b->id]])
            ->assertRedirect(route('admin.ai.ely'));

        $this->assertEqualsCanonicalizing([(int) $a->id, (int) $b->id], app(ElyEngineSelector::class)->enabledCompanyIds());
    }

    public function test_picker_lists_real_companies_as_checkboxes_and_excludes_demo(): void
    {
        $real = $this->company();
        $demo = $this->company();
        $demo->forceFill(['is_demo' => true])->save();

        $this->actingAs($this->admin('super_admin'), 'admin')
            ->get(route('admin.ai.ely'))
            ->assertOk()
            ->assertSee('Choose the companies')
            ->assertSee($real->name)
            ->assertSee('name="company_ids[]"', false)
            ->assertSee('value="'.$real->id.'"', false)
            ->assertDontSee('value="'.$demo->id.'"', false);
    }

    public function test_empty_submit_clears_the_rollout(): void
    {
        $company = $this->company();
        PlatformSetting::query()->create(['key' => ElyEngineSelector::COMPANY_IDS_KEY, 'value' => (string) $company->id]);
        ElyEngineSelector::forgetCache();

        $this->actingAs($this->admin('super_admin'), 'admin')
            ->post(route('admin.ai.ely.rollout'), [])
            ->assertRedirect(route('admin.ai.ely'));

        $this->assertSame([], app(ElyEngineSelector::class)->enabledCompanyIds());
    }

    public function test_new_engine_is_the_default_when_nothing_overrides_it(): void
    {
        config(['ely.agent.engine' => 'agent']);

        $this->assertSame('agent', app(ElyEngineSelector::class)->globalEngine());
        // The shipped default (no ELY_ENGINE set on the server) is the new engine.
        $this->assertStringContainsString("env('ELY_ENGINE', 'agent')", (string) file_get_contents(config_path('ely.php')));
    }

    public function test_admin_can_switch_every_company_instantly_and_back(): void
    {
        config(['ely.agent.engine' => 'agent']);
        $admin = $this->admin('super_admin');
        $selector = app(ElyEngineSelector::class);

        $this->actingAs($admin, 'admin')->post(route('admin.ai.ely.engine'), ['engine' => 'legacy'])
            ->assertRedirect(route('admin.ai.ely'));
        $this->assertSame('legacy', $selector->globalEngine());
        $this->assertTrue($selector->globalEngineIsOverridden());

        $this->actingAs($admin, 'admin')->post(route('admin.ai.ely.engine'), ['engine' => 'default']);
        $this->assertSame('agent', $selector->globalEngine());
        $this->assertFalse($selector->globalEngineIsOverridden());
    }

    public function test_non_super_admin_cannot_switch_the_engine(): void
    {
        $this->actingAs($this->admin('admin'), 'admin')
            ->post(route('admin.ai.ely.engine'), ['engine' => 'legacy'])
            ->assertForbidden();
    }

    public function test_companies_can_be_kept_on_the_old_engine_while_everyone_else_moves(): void
    {
        config(['ely.agent.engine' => 'agent']);
        $kept = $this->company();
        $moved = $this->company();

        // While the new engine is on, the picker edits the "keep on old" list.
        $this->actingAs($this->admin('super_admin'), 'admin')
            ->get(route('admin.ai.ely'))
            ->assertOk()
            ->assertSee('Companies kept on the old ELY')
            ->assertSee('name="list" value="legacy"', false);

        $this->actingAs($this->admin('super_admin'), 'admin')
            ->post(route('admin.ai.ely.rollout'), ['list' => 'legacy', 'company_ids' => [$kept->id]])
            ->assertRedirect(route('admin.ai.ely'));

        $selector = app(ElyEngineSelector::class);
        $this->assertSame([(int) $kept->id], $selector->legacyCompanyIds());

        // Tool calling is available in this test, so only the exception differs.
        $router = app(\App\Services\AI\Agent\Chat\ChatRouter::class);
        $router->useAdapters(['openai' => new \Tests\Support\ScriptedChatAdapter('openai')]);
        $this->app->instance(\App\Services\AI\Agent\Chat\ChatRouter::class, $router);
        $selector = app(ElyEngineSelector::class);

        $this->assertFalse($selector->useAgent((int) $kept->id));
        $this->assertTrue($selector->useAgent((int) $moved->id));
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
