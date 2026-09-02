<?php

declare(strict_types=1);

namespace Tests\Feature\Internal;

use App\Models\Company;
use App\Models\InternalUserAuditLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class InternalUserLifecycleTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_can_suspend_and_delete_supervisor_and_agent(): void
    {
        [$company, $owner, $supervisor, $agent] = $this->seedCompanyHierarchy();

        Sanctum::actingAs($owner);

        $this->postJson('/api/v1/internal-users/' . $supervisor->id . '/suspend', [
            'company_id' => $company->id,
            'suspend_type' => 'duration',
            'suspend_days' => 7,
        ])->assertOk();

        $this->assertDatabaseHas('users', [
            'id' => $supervisor->id,
        ]);
        $this->assertTrue($supervisor->fresh()->suspended_until?->isFuture() ?? false);

        $this->postJson('/api/v1/internal-users/' . $supervisor->id . '/reactivate', [
            'company_id' => $company->id,
        ])->assertOk();

        $agent->createToken('agent-session', ['*'])->plainTextToken;

        $this->deleteJson('/api/v1/internal-users/' . $agent->id, [
            'company_id' => $company->id,
        ])->assertOk();

        $this->assertSoftDeleted('users', ['id' => $agent->id]);
        $this->assertDatabaseMissing('personal_access_tokens', [
            'tokenable_id' => $agent->id,
        ]);
    }

    public function test_admin_can_suspend_agent(): void
    {
        [$company, , , $agent] = $this->seedCompanyHierarchy();

        $admin = User::factory()->create([
            'email_verified_at' => now(),
            'internal_role' => 'admin',
            'is_active' => true,
        ]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $admin->id,
            'role' => 'admin',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/internal-users/' . $agent->id . '/suspend', [
            'company_id' => $company->id,
            'suspend_type' => 'permanent',
        ])->assertOk();

        $this->assertTrue($agent->fresh()->suspended_until?->year === 2038);
    }

    public function test_supervisor_cannot_suspend_agent_without_privilege(): void
    {
        [$company, , $supervisor, $agent] = $this->seedCompanyHierarchy();

        Sanctum::actingAs($supervisor);

        $this->postJson('/api/v1/internal-users/' . $agent->id . '/suspend', [
            'company_id' => $company->id,
            'suspend_type' => 'duration',
            'suspend_days' => 3,
        ])->assertStatus(422)
            ->assertJsonPath('errors.authorization.0', 'Your account does not have permission to suspend agents.');
    }

    public function test_supervisor_can_suspend_own_agent_when_privilege_granted(): void
    {
        [$company, $owner, $supervisor, $agent] = $this->seedCompanyHierarchy();

        $company->update([
            'settings' => [
                'user_management' => [
                    'supervisor_can_suspend_agents' => true,
                    'supervisor_can_delete_agents' => false,
                ],
            ],
        ]);

        Sanctum::actingAs($supervisor);

        $this->postJson('/api/v1/internal-users/' . $agent->id . '/suspend', [
            'company_id' => $company->id,
            'suspend_type' => 'duration',
            'suspend_days' => 3,
        ])->assertOk();

        $this->assertTrue($agent->fresh()->suspended_until?->isFuture() ?? false);
    }

    public function test_supervisor_cannot_suspend_agent_assigned_to_another_supervisor_even_with_privilege(): void
    {
        [$company, , $supervisor, $agent] = $this->seedCompanyHierarchy();

        $otherSupervisor = User::factory()->create([
            'email_verified_at' => now(),
            'internal_role' => 'supervisor',
            'is_active' => true,
        ]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $otherSupervisor->id,
            'role' => 'supervisor',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $company->update([
            'settings' => [
                'user_management' => [
                    'supervisor_can_suspend_agents' => true,
                    'supervisor_can_delete_agents' => true,
                ],
            ],
        ]);

        Sanctum::actingAs($otherSupervisor);

        $this->postJson('/api/v1/internal-users/' . $agent->id . '/suspend', [
            'company_id' => $company->id,
            'suspend_type' => 'duration',
            'suspend_days' => 3,
        ])->assertStatus(422)
            ->assertJsonPath('errors.authorization.0', 'You can only manage agents assigned to you.');
    }

    public function test_supervisor_can_delete_own_agent_when_privilege_granted(): void
    {
        [$company, , $supervisor, $agent] = $this->seedCompanyHierarchy();

        $company->update([
            'settings' => [
                'user_management' => [
                    'supervisor_can_suspend_agents' => false,
                    'supervisor_can_delete_agents' => true,
                ],
            ],
        ]);

        Sanctum::actingAs($supervisor);

        $this->deleteJson('/api/v1/internal-users/' . $agent->id, [
            'company_id' => $company->id,
        ])->assertOk();

        $this->assertSoftDeleted('users', ['id' => $agent->id]);
    }

    public function test_supervisor_cannot_delete_supervisor_even_with_privilege(): void
    {
        [$company, , $supervisor] = $this->seedCompanyHierarchy();

        $otherSupervisor = User::factory()->create([
            'email_verified_at' => now(),
            'internal_role' => 'supervisor',
            'is_active' => true,
        ]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $otherSupervisor->id,
            'role' => 'supervisor',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $company->update([
            'settings' => [
                'user_management' => [
                    'supervisor_can_suspend_agents' => true,
                    'supervisor_can_delete_agents' => true,
                ],
            ],
        ]);

        Sanctum::actingAs($supervisor);

        $this->deleteJson('/api/v1/internal-users/' . $otherSupervisor->id, [
            'company_id' => $company->id,
        ])->assertStatus(422)
            ->assertJsonPath('errors.authorization.0', 'You can only manage agents assigned to you.');
    }

    public function test_supervisor_can_edit_own_agent_but_not_other_supervisor(): void
    {
        [$company, , $supervisor, $agent] = $this->seedCompanyHierarchy();

        Sanctum::actingAs($supervisor);

        $this->patchJson('/api/v1/internal-users/' . $agent->id, [
            'company_id' => $company->id,
            'full_name' => 'Updated Agent Name',
        ])->assertOk();

        $this->assertSame('Updated Agent Name', $agent->fresh()->name);

        $otherSupervisor = User::factory()->create([
            'email_verified_at' => now(),
            'internal_role' => 'supervisor',
            'is_active' => true,
        ]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $otherSupervisor->id,
            'role' => 'supervisor',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->patchJson('/api/v1/internal-users/' . $otherSupervisor->id, [
            'company_id' => $company->id,
            'full_name' => 'Should Fail',
        ])->assertStatus(422)
            ->assertJsonPath('errors.authorization.0', 'You can only manage agents assigned to you.');
    }

    public function test_supervisor_cannot_promote_agent_to_admin(): void
    {
        [$company, , $supervisor, $agent] = $this->seedCompanyHierarchy();

        Sanctum::actingAs($supervisor);

        $this->patchJson('/api/v1/internal-users/' . $agent->id, [
            'company_id' => $company->id,
            'role' => 'admin',
        ])->assertStatus(422)
            ->assertJsonPath('errors.role.0', 'Only owners and admins can assign admin or supervisor roles.');
    }

    public function test_user_cannot_suspend_themselves(): void
    {
        [$company, $owner] = array_slice($this->seedCompanyHierarchy(), 0, 2);

        Sanctum::actingAs($owner);

        $this->postJson('/api/v1/internal-users/' . $owner->id . '/suspend', [
            'company_id' => $company->id,
            'suspend_type' => 'duration',
            'suspend_days' => 3,
        ])->assertStatus(422)
            ->assertJsonPath('errors.authorization.0', 'You cannot perform this action on your own account.');
    }

    public function test_lifecycle_actions_write_audit_logs(): void
    {
        [$company, $owner, , $agent] = $this->seedCompanyHierarchy();

        Sanctum::actingAs($owner);

        $this->postJson('/api/v1/internal-users/' . $agent->id . '/suspend', [
            'company_id' => $company->id,
            'suspend_type' => 'duration',
            'suspend_days' => 3,
        ])->assertOk();

        $this->assertDatabaseHas('internal_user_audit_logs', [
            'company_id' => $company->id,
            'actor_user_id' => $owner->id,
            'target_user_id' => $agent->id,
            'action' => 'suspended',
        ]);
    }

    public function test_owner_can_view_audit_logs_and_supervisor_cannot(): void
    {
        [$company, $owner, $supervisor, $agent] = $this->seedCompanyHierarchy();

        InternalUserAuditLog::query()->create([
            'company_id' => $company->id,
            'actor_user_id' => $owner->id,
            'target_user_id' => $agent->id,
            'action' => 'updated',
            'metadata' => ['changes' => ['full_name' => 'Test']],
        ]);

        Sanctum::actingAs($owner);

        $this->getJson('/api/v1/internal-users/audit-logs?company_id=' . $company->id)
            ->assertOk()
            ->assertJsonPath('data.items.0.action', 'updated');

        Sanctum::actingAs($supervisor);

        $this->getJson('/api/v1/internal-users/audit-logs?company_id=' . $company->id)
            ->assertStatus(422)
            ->assertJsonPath('errors.authorization.0', 'You are not allowed to view user management audit logs.');
    }

    public function test_owner_can_update_supervisor_privilege_settings(): void
    {
        [$company, $owner] = array_slice($this->seedCompanyHierarchy(), 0, 2);

        Sanctum::actingAs($owner);

        $this->patchJson('/api/v1/company/settings', [
            'company_id' => $company->id,
            'user_management' => [
                'supervisor_can_suspend_agents' => true,
                'supervisor_can_delete_agents' => true,
            ],
        ])->assertOk()
            ->assertJsonPath('data.user_management.supervisor_can_suspend_agents', true)
            ->assertJsonPath('data.user_management.supervisor_can_delete_agents', true);

        $this->assertDatabaseHas('internal_user_audit_logs', [
            'company_id' => $company->id,
            'actor_user_id' => $owner->id,
            'action' => 'privilege_updated',
        ]);
    }

    /**
     * @return array{0: Company, 1: User, 2: User, 3: User}
     */
    private function seedCompanyHierarchy(): array
    {
        $company = Company::create([
            'company_id' => 'FAC-LIFE-001',
            'name' => 'Lifecycle Test Co',
            'country' => 'NG',
            'currency_code' => 'NGN',
            'team_size' => '11-50',
            'use_case' => 'Testing',
            'status' => 'active',
            'activated_at' => now(),
            'subscription_status' => 'active',
            'subscription_plan_key' => 'up_to_50',
            'subscription_billing_interval' => 'monthly',
            'subscription_current_period_start' => now(),
            'subscription_current_period_end' => now()->addMonth(),
        ]);

        $owner = User::factory()->create([
            'email_verified_at' => now(),
            'is_active' => true,
            'internal_role' => null,
        ]);

        $supervisor = User::factory()->create([
            'email_verified_at' => now(),
            'is_active' => true,
            'internal_role' => 'supervisor',
        ]);

        $agent = User::factory()->create([
            'email_verified_at' => now(),
            'is_active' => true,
            'internal_role' => 'agent',
            'supervisor_user_id' => $supervisor->id,
            'onboarding_status' => 'active',
            'internal_onboarding_completed_at' => now(),
        ]);

        DB::table('company_users')->insert([
            [
                'company_id' => $company->id,
                'user_id' => $owner->id,
                'role' => 'owner',
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
            [
                'company_id' => $company->id,
                'user_id' => $agent->id,
                'role' => 'agent',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        return [$company, $owner, $supervisor, $agent];
    }
}
