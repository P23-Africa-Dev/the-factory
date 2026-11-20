<?php

declare(strict_types=1);

namespace Tests\Feature\Kpi;

use App\Models\Company;
use App\Models\Kpi;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class KpiManagerStatusTransitionTest extends TestCase
{
    use RefreshDatabase;

    private const STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'];

    public function test_managers_can_move_kpis_between_any_two_statuses(): void
    {
        [$company, $owner, $admin, $agent] = $this->seedCompanyUsers();
        $supervisor = $this->addMember($company, 'supervisor');

        foreach (['owner' => $owner, 'admin' => $admin, 'supervisor' => $supervisor] as $role => $manager) {
            foreach (self::STATUSES as $from) {
                foreach (self::STATUSES as $to) {
                    $kpi = $this->createKpi($company, $owner, $agent, ['status' => $from]);

                    $this->actingAs($manager, 'sanctum')
                        ->patchJson('/api/v1/admin/kpis/'.$kpi->id.'/status', [
                            'company_id' => $company->company_id,
                            'status' => $to,
                        ])
                        ->assertOk()
                        ->assertJsonPath('data.kpi.status', $to);

                    $this->assertSame($to, $kpi->fresh()->status?->value, "{$role}: {$from} -> {$to}");
                }
            }
        }
    }

    public function test_reopening_kpi_clears_completed_and_cancelled_timestamps(): void
    {
        [$company, $owner, , $agent] = $this->seedCompanyUsers();

        $cancelled = $this->createKpi($company, $owner, $agent, [
            'status' => 'cancelled',
            'cancelled_at' => now()->subHour(),
        ]);
        $completed = $this->createKpi($company, $owner, $agent, [
            'status' => 'completed',
            'started_at' => now()->subDay(),
            'completed_at' => now()->subHour(),
        ]);

        $this->actingAs($owner, 'sanctum')
            ->patchJson('/api/v1/admin/kpis/'.$cancelled->id.'/status', [
                'company_id' => $company->company_id,
                'status' => 'in_progress',
            ])
            ->assertOk();

        $this->actingAs($owner, 'sanctum')
            ->patchJson('/api/v1/admin/kpis/'.$completed->id.'/status', [
                'company_id' => $company->company_id,
                'status' => 'pending',
            ])
            ->assertOk();

        $cancelled->refresh();
        $this->assertNull($cancelled->cancelled_at);
        $this->assertNull($cancelled->completed_at);
        $this->assertNotNull($cancelled->started_at);

        $completed->refresh();
        $this->assertNull($completed->completed_at);
        $this->assertNull($completed->cancelled_at);
        $this->assertNull($completed->started_at);
    }

    public function test_agent_can_move_kpi_freely_except_reopening_cancelled(): void
    {
        [$company, $owner, , $agent] = $this->seedCompanyUsers();

        // Same freedom as the task board: any column, including back from Completed.
        $pending = $this->createKpi($company, $owner, $agent, ['status' => 'pending']);
        $this->actingAs($agent, 'sanctum')
            ->patchJson('/api/v1/agent/kpis/'.$pending->id.'/status', [
                'company_id' => $company->company_id,
                'status' => 'completed',
            ])
            ->assertOk();

        $completed = $this->createKpi($company, $owner, $agent, ['status' => 'completed']);
        $this->actingAs($agent, 'sanctum')
            ->patchJson('/api/v1/agent/kpis/'.$completed->id.'/status', [
                'company_id' => $company->company_id,
                'status' => 'pending',
            ])
            ->assertOk();

        // Reopening a cancelled KPI still needs a manager, with a clear reason.
        $cancelled = $this->createKpi($company, $owner, $agent, ['status' => 'cancelled']);
        $this->actingAs($agent, 'sanctum')
            ->patchJson('/api/v1/agent/kpis/'.$cancelled->id.'/status', [
                'company_id' => $company->company_id,
                'status' => 'in_progress',
            ])
            ->assertUnprocessable()
            ->assertJsonPath('errors.status.0', 'Cancelled KPIs can only be reopened by a manager.');

        $this->assertSame('completed', $pending->fresh()->status?->value);
        $this->assertSame('pending', $completed->fresh()->status?->value);
        $this->assertSame('cancelled', $cancelled->fresh()->status?->value);
    }

    private function createKpi(Company $company, User $creator, User $assignee, array $overrides = []): Kpi
    {
        return Kpi::create(array_merge([
            'company_id' => $company->id,
            'created_by_user_id' => $creator->id,
            'assigned_to_user_id' => $assignee->id,
            'name' => 'Board KPI',
            'category' => 'sales',
            'objective' => 'Acquire retailers.',
            'target_value' => '10 visits',
            'expected_outcome' => 'Complete visits.',
            'priority' => 'medium',
            'status' => 'pending',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addWeek()->toDateString(),
        ], $overrides));
    }

    private function seedCompanyUsers(): array
    {
        $company = Company::create([
            'company_id' => 'FAC-KPIDND1',
            'name' => 'KPI Board Company',
            'country' => 'NG',
            'currency_code' => 'NGN',
            'team_size' => '11-50',
            'use_case' => 'operations',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $owner = $this->addMember($company, 'owner');
        $admin = $this->addMember($company, 'admin');
        $agent = $this->addMember($company, 'agent');

        return [$company, $owner, $admin, $agent];
    }

    private function addMember(Company $company, string $role): User
    {
        $user = User::factory()->create(['email_verified_at' => now()]);

        DB::table('company_users')->insert([
            'company_id' => $company->id,
            'user_id' => $user->id,
            'role' => $role,
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $user;
    }
}
