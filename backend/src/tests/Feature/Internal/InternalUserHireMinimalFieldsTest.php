<?php

declare(strict_types=1);

namespace Tests\Feature\Internal;

use App\Models\AgentLocationSnapshot;
use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * Hiring requires only name, email and role; owners and admins can supervise agents.
 */
class InternalUserHireMinimalFieldsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    public function test_owner_can_hire_each_role_with_only_name_email_and_role(): void
    {
        $f = $this->seed_();

        foreach (['agent', 'supervisor', 'admin'] as $i => $role) {
            $email = "minimal-{$role}@factory.test";

            $this->withToken($this->token($f['owner']))
                ->postJson('/api/v1/internal-users', [
                    'company_id' => $f['company']->id,
                    'full_name' => "Minimal {$role}",
                    'email' => $email,
                    'role' => $role,
                ])
                ->assertCreated();

            $user = User::query()->where('email', $email)->firstOrFail();
            $this->assertSame($role, $user->internal_role);
            // Left empty means "not configured yet" — no invented defaults.
            $this->assertNull($user->work_days);
            $this->assertNull($user->base_salary);
            $this->assertNull($user->supervisor_user_id);
            $this->app['auth']->forgetGuards();
        }
    }

    public function test_missing_name_email_or_role_is_rejected(): void
    {
        $f = $this->seed_();

        $this->withToken($this->token($f['owner']))
            ->postJson('/api/v1/internal-users', ['company_id' => $f['company']->id])
            ->assertUnprocessable()
            ->assertJsonStructure(['errors' => ['full_name', 'email', 'role']]);
    }

    public function test_owner_and_admin_can_be_set_as_agent_supervisor(): void
    {
        $f = $this->seed_();

        foreach (['owner', 'admin'] as $who) {
            $email = "agent-under-{$who}@factory.test";

            $this->withToken($this->token($f['owner']))
                ->postJson('/api/v1/internal-users', [
                    'company_id' => $f['company']->id,
                    'full_name' => "Agent under {$who}",
                    'email' => $email,
                    'role' => 'agent',
                    'supervisor_user_id' => $f[$who]->id,
                ])
                ->assertCreated();

            $this->assertSame($f[$who]->id, (int) User::query()->where('email', $email)->value('supervisor_user_id'));
        }
    }

    public function test_supervisor_from_another_company_is_rejected_on_supervisor_field(): void
    {
        $f = $this->seed_();
        $outsider = User::factory()->create(['internal_role' => 'supervisor']);

        $this->withToken($this->token($f['owner']))
            ->postJson('/api/v1/internal-users', [
                'company_id' => $f['company']->id,
                'full_name' => 'Agent Bad Supervisor',
                'email' => 'bad-supervisor@factory.test',
                'role' => 'agent',
                'supervisor_user_id' => $outsider->id,
            ])
            ->assertUnprocessable()
            ->assertJsonStructure(['errors' => ['supervisor_user_id']]);

        $this->assertDatabaseMissing('users', ['email' => 'bad-supervisor@factory.test']);
    }

    public function test_supervisor_cannot_hire_admin_or_supervisor(): void
    {
        $f = $this->seed_();

        foreach (['admin', 'supervisor'] as $role) {
            $this->withToken($this->token($f['supervisor']))
                ->postJson('/api/v1/internal-users', [
                    'company_id' => $f['company']->id,
                    'full_name' => "Escalated {$role}",
                    'email' => "escalated-{$role}@factory.test",
                    'role' => $role,
                ])
                ->assertUnprocessable()
                ->assertJsonStructure(['errors' => ['role']]);
        }
    }

    public function test_supervisor_candidates_include_owner_admin_and_supervisors(): void
    {
        $f = $this->seed_();

        $response = $this->withToken($this->token($f['owner']))
            ->getJson('/api/v1/internal-users/supervisor-candidates?company_id=' . $f['company']->id)
            ->assertOk();

        $byId = collect($response->json('data'))->keyBy('id');
        $this->assertSame('owner', $byId[$f['owner']->id]['role']);
        $this->assertSame('admin', $byId[$f['admin']->id]['role']);
        $this->assertSame('supervisor', $byId[$f['supervisor']->id]['role']);
        $this->assertFalse($byId->has($f['agent']->id));
        // Owner listed first.
        $this->assertSame($f['owner']->id, $response->json('data.0.id'));
    }

    public function test_supervisor_only_sees_themselves_as_candidate(): void
    {
        $f = $this->seed_();

        $response = $this->withToken($this->token($f['supervisor']))
            ->getJson('/api/v1/internal-users/supervisor-candidates?company_id=' . $f['company']->id)
            ->assertOk();

        $this->assertSame([$f['supervisor']->id], collect($response->json('data'))->pluck('id')->all());
    }

    public function test_agent_supervised_by_owner_stays_hidden_from_other_supervisors_on_map(): void
    {
        $f = $this->seed_();
        $f['agent']->forceFill(['supervisor_user_id' => $f['owner']->id])->save();

        AgentLocationSnapshot::query()->create([
            'company_id' => $f['company']->id,
            'user_id' => $f['agent']->id,
            'latitude' => 6.5,
            'longitude' => 3.4,
            'event_type' => 'movement',
            'recorded_at' => now(),
            'last_seen_at' => now(),
        ]);

        $ownerIds = collect($this->withToken($this->token($f['owner']))
            ->getJson('/api/v1/agents/locations?company_id=' . $f['company']->id)
            ->assertOk()->json('data.items'))->pluck('agent.id')->all();
        $this->assertContains($f['agent']->id, $ownerIds);

        // The test client caches the authenticated user between requests.
        $this->app['auth']->forgetGuards();

        $supervisorIds = collect($this->withToken($this->token($f['supervisor']))
            ->getJson('/api/v1/agents/locations?company_id=' . $f['company']->id)
            ->assertOk()->json('data.items'))->pluck('agent.id')->all();
        $this->assertNotContains($f['agent']->id, $supervisorIds);
    }

    private function token(User $user): string
    {
        return $user->createToken('test', ['*'])->plainTextToken;
    }

    /** @return array{company: Company, owner: User, admin: User, supervisor: User, agent: User} */
    private function seed_(): array
    {
        $company = Company::create([
            'company_id' => 'FAC-HIRE-MIN',
            'name' => 'Hire Minimal Ltd',
            'country' => 'NG',
            'currency_code' => 'NGN',
            'team_size' => '11-50',
            'use_case' => 'Hiring',
            'status' => 'active',
            'activated_at' => now(),
            'subscription_status' => 'active',
            'subscription_plan_key' => 'up_to_50',
            'subscription_billing_interval' => 'monthly',
            'subscription_current_period_start' => now(),
            'subscription_current_period_end' => now()->addMonth(),
        ]);

        $owner = User::factory()->create(['email_verified_at' => now(), 'internal_role' => null]);
        $admin = User::factory()->create(['email_verified_at' => now(), 'internal_role' => 'admin', 'is_active' => true]);
        $supervisor = User::factory()->create(['email_verified_at' => now(), 'internal_role' => 'supervisor', 'is_active' => true]);
        $agent = User::factory()->create(['email_verified_at' => now(), 'internal_role' => 'agent', 'is_active' => true]);

        foreach ([[$owner, 'owner'], [$admin, 'admin'], [$supervisor, 'supervisor'], [$agent, 'agent']] as [$u, $role]) {
            DB::table('company_users')->insert([
                'company_id' => $company->id,
                'user_id' => $u->id,
                'role' => $role,
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        return compact('company', 'owner', 'admin', 'supervisor', 'agent');
    }
}
