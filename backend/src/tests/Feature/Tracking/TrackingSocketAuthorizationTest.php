<?php

declare(strict_types=1);

namespace Tests\Feature\Tracking;

use App\Models\Company;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class TrackingSocketAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    private const URL = '/api/v1/tracking/socket-authorization';

    public function test_admin_gets_company_wide_scope_and_all_company_tasks(): void
    {
        $f = $this->seedFixture();

        $response = $this->actingAs($f['admin'], 'sanctum')
            ->getJson(self::URL . '?company_id=' . $f['company']->id . '&task_ids=' . $f['taskA']->id . ',' . $f['taskB']->id . ',' . $f['otherCompanyTask']->id);

        $response->assertOk()
            ->assertJsonPath('data.scope', 'company')
            ->assertJsonPath('data.access_role', 'management')
            ->assertJsonPath('data.visible_user_ids', null)
            ->assertJsonPath('data.company.id', $f['company']->id)
            ->assertJsonPath('data.allowed_task_ids', [$f['taskA']->id, $f['taskB']->id]);
    }

    public function test_supervisor_only_sees_their_own_agents_and_tasks(): void
    {
        $f = $this->seedFixture();

        $response = $this->actingAs($f['supervisor'], 'sanctum')
            ->getJson(self::URL . '?company_id=' . $f['company']->id . '&task_ids=' . $f['taskA']->id . ',' . $f['taskB']->id);

        $response->assertOk()
            ->assertJsonPath('data.scope', 'supervisor')
            ->assertJsonPath('data.access_role', 'management')
            ->assertJsonPath('data.visible_user_ids', [$f['agentA']->id])
            ->assertJsonPath('data.allowed_task_ids', [$f['taskA']->id]);
    }

    public function test_agent_only_gets_own_tasks(): void
    {
        $f = $this->seedFixture();

        $response = $this->actingAs($f['agentA'], 'sanctum')
            ->getJson(self::URL . '?company_id=' . $f['company']->id . '&task_ids=' . $f['taskA']->id . ',' . $f['taskB']->id);

        $response->assertOk()
            ->assertJsonPath('data.scope', 'self')
            ->assertJsonPath('data.access_role', 'agent')
            ->assertJsonPath('data.visible_user_ids', [$f['agentA']->id])
            ->assertJsonPath('data.allowed_task_ids', [$f['taskA']->id]);
    }

    public function test_agent_can_follow_task_they_observe(): void
    {
        $f = $this->seedFixture();

        DB::table('task_observers')->insert([
            'task_id' => $f['taskB']->id,
            'user_id' => $f['agentA']->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($f['agentA'], 'sanctum')
            ->getJson(self::URL . '?company_id=' . $f['company']->id . '&task_ids=' . $f['taskB']->id)
            ->assertOk()
            ->assertJsonPath('data.allowed_task_ids', [$f['taskB']->id]);
    }

    public function test_public_company_id_hint_is_accepted(): void
    {
        $f = $this->seedFixture();

        $this->actingAs($f['admin'], 'sanctum')
            ->getJson(self::URL . '?company_id=' . $f['company']->company_id)
            ->assertOk()
            ->assertJsonPath('data.company.id', $f['company']->id);
    }

    public function test_multi_company_user_can_authorize_for_non_default_company(): void
    {
        $f = $this->seedFixture();

        // The admin's most recent membership is the other company, so it is
        // their default context; asking for the first company must still work.
        $this->attach($f['otherCompany'], $f['admin'], 'admin', now()->addMinute());

        $this->actingAs($f['admin'], 'sanctum')
            ->getJson(self::URL . '?company_id=' . $f['company']->id)
            ->assertOk()
            ->assertJsonPath('data.company.id', $f['company']->id);
    }

    public function test_non_member_company_is_rejected(): void
    {
        $f = $this->seedFixture();

        $this->actingAs($f['agentA'], 'sanctum')
            ->getJson(self::URL . '?company_id=' . $f['otherCompany']->id)
            ->assertStatus(422);
    }

    public function test_unauthenticated_request_is_rejected(): void
    {
        $this->getJson(self::URL)->assertUnauthorized();
    }

    private function seedFixture(): array
    {
        $company = $this->company('FAC-WSAUTH-1');
        $otherCompany = $this->company('FAC-WSAUTH-2');

        $admin = $this->user('admin');
        $supervisor = $this->user('supervisor');
        $agentA = $this->user('agent', $supervisor->id);
        $agentB = $this->user('agent');

        $this->attach($company, $admin, 'admin');
        $this->attach($company, $supervisor, 'supervisor');
        $this->attach($company, $agentA, 'agent');
        $this->attach($company, $agentB, 'agent');

        $taskA = $this->task($company, $admin, $agentA);
        $taskB = $this->task($company, $admin, $agentB);

        $otherAdmin = $this->user('admin');
        $this->attach($otherCompany, $otherAdmin, 'admin');
        $otherCompanyTask = $this->task($otherCompany, $otherAdmin, $otherAdmin);

        return compact('company', 'otherCompany', 'admin', 'supervisor', 'agentA', 'agentB', 'taskA', 'taskB', 'otherCompanyTask');
    }

    private function company(string $code): Company
    {
        return Company::create([
            'company_id' => $code,
            'name' => 'Socket Auth ' . $code,
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Tracking',
            'status' => 'active',
            'activated_at' => now(),
        ]);
    }

    private function user(string $role, ?int $supervisorId = null): User
    {
        return User::factory()->create([
            'email_verified_at' => now(),
            'internal_role' => $role,
            'onboarding_status' => 'active',
            'is_active' => true,
            'supervisor_user_id' => $supervisorId,
        ]);
    }

    private function attach(Company $company, User $user, string $role, $joinedAt = null): void
    {
        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $user->id,
            'role' => $role,
            'joined_at' => $joinedAt ?? now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function task(Company $company, User $creator, User $assignee): Task
    {
        return Task::create([
            'company_id' => $company->id,
            'created_by_user_id' => $creator->id,
            'assigned_agent_id' => $assignee->id,
            'title' => 'Visit',
            'type' => 'inspection',
            'description' => 'Socket auth test task.',
            'status' => 'pending',
            'priority' => 'medium',
            'latitude' => 6.5244,
            'longitude' => 3.3792,
        ]);
    }
}
