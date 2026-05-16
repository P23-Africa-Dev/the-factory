<?php

declare(strict_types=1);

namespace Tests\Feature\Dashboard;

use App\Models\Company;
use App\Models\Lead;
use App\Models\Task;
use App\Models\TaskLocationPoint;
use App\Models\TaskTrackingSession;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class DashboardAndWorkforceSummaryTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_fetch_dashboard_and_workforce_summaries(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();

        Task::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'assigned_agent_id' => $agent->id,
            'title' => 'Pending Task',
            'type' => 'inspection',
            'description' => 'Pending task description',
            'status' => 'pending',
        ]);

        Task::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'assigned_agent_id' => $agent->id,
            'title' => 'Completed Task',
            'type' => 'inspection',
            'description' => 'Completed task description',
            'status' => 'completed',
            'completed_at' => now(),
        ]);

        $lead = Lead::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'assigned_to_user_id' => $agent->id,
            'name' => 'Qualified Prospect',
            'status' => 'qualified',
            'priority' => 'medium',
        ]);

        $session = TaskTrackingSession::create([
            'task_id' => 1,
            'company_id' => $company->id,
            'started_by_user_id' => $agent->id,
            'start_latitude' => 6.4,
            'start_longitude' => 3.4,
            'start_recorded_at' => now()->subMinutes(20),
        ]);

        TaskLocationPoint::create([
            'tracking_session_id' => $session->id,
            'task_id' => 1,
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'latitude' => 6.401,
            'longitude' => 3.401,
            'event_type' => 'ping',
            'is_checkpoint' => false,
            'recorded_at' => now()->subMinutes(5),
        ]);

        $dashboardResponse = $this->withToken($admin->createToken('admin-dashboard-token', ['*'])->plainTextToken)
            ->getJson('/api/v1/dashboard/overview?company_id=' . $company->id);

        $dashboardResponse->assertOk()
            ->assertJsonPath('data.kpis.total_tasks', 2)
            ->assertJsonPath('data.kpis.total_leads', 1)
            ->assertJsonPath('data.crm_pipeline_snapshot.total', 1)
            ->assertJsonPath('data.top_prospects.0.id', $lead->id);

        $workforceResponse = $this->withToken($admin->createToken('admin-workforce-token', ['*'])->plainTextToken)
            ->getJson('/api/v1/workforce/summary?company_id=' . $company->id);

        $workforceResponse->assertOk()
            ->assertJsonPath('data.agent_summary.total_agents', 1)
            ->assertJsonPath('data.task_distribution.pending', 1)
            ->assertJsonPath('data.task_distribution.completed', 1)
            ->assertJsonPath('data.attendance_proxy.agents_with_location_ping_last_30m', 1);
    }

    public function test_agent_can_fetch_summaries_but_cannot_escape_company_scope(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();

        $otherCompany = Company::create([
            'company_id' => 'FAC-DASH-002',
            'name' => 'Other Dashboard Company',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Cross company dashboard isolation',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $otherAdmin = User::factory()->create(['email_verified_at' => now()]);

        DB::table('company_users')->insert([
            'company_id' => $otherCompany->id,
            'user_id' => $otherAdmin->id,
            'role' => 'admin',
            'joined_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Lead::create([
            'company_id' => $otherCompany->id,
            'created_by_user_id' => $otherAdmin->id,
            'name' => 'External Lead',
            'status' => 'new',
            'priority' => 'low',
        ]);

        $dashboardResponse = $this->withToken($agent->createToken('agent-dashboard-token', ['*'])->plainTextToken)
            ->getJson('/api/v1/dashboard/overview?company_id=' . $company->id);

        $dashboardResponse->assertOk();

        $crossCompanyResponse = $this->withToken($agent->createToken('agent-dashboard-cross-company-token', ['*'])->plainTextToken)
            ->getJson('/api/v1/dashboard/overview?company_id=' . $otherCompany->id);

        $crossCompanyResponse->assertUnprocessable()
            ->assertJsonValidationErrors(['company_id']);

        $workforceResponse = $this->withToken($agent->createToken('agent-workforce-token', ['*'])->plainTextToken)
            ->getJson('/api/v1/workforce/summary?company_id=' . $company->id);

        $workforceResponse->assertOk()
            ->assertJsonPath('data.agent_summary.total_agents', 1);
    }

    public function test_cache_is_invalidated_after_task_or_lead_mutation(): void
    {
        [$company, $admin, $agent] = $this->seedCompanyUsers();

        $token = $admin->createToken('admin-cache-token', ['*'])->plainTextToken;

        $initial = $this->withToken($token)
            ->getJson('/api/v1/dashboard/overview?company_id=' . $company->id);

        $initial->assertOk()
            ->assertJsonPath('data.kpis.total_tasks', 0)
            ->assertJsonPath('data.kpis.total_leads', 0);

        Task::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'assigned_agent_id' => $agent->id,
            'title' => 'Cache Bust Task',
            'type' => 'inspection',
            'description' => 'Task to invalidate aggregate cache',
            'status' => 'pending',
        ]);

        Lead::create([
            'company_id' => $company->id,
            'created_by_user_id' => $admin->id,
            'assigned_to_user_id' => $agent->id,
            'name' => 'Cache Bust Lead',
            'status' => 'contacted',
            'priority' => 'high',
        ]);

        $afterMutation = $this->withToken($token)
            ->getJson('/api/v1/dashboard/overview?company_id=' . $company->id);

        $afterMutation->assertOk()
            ->assertJsonPath('data.kpis.total_tasks', 1)
            ->assertJsonPath('data.kpis.total_leads', 1);
    }

    private function seedCompanyUsers(): array
    {
        $company = Company::create([
            'company_id' => 'FAC-DASH-001',
            'name' => 'Dashboard Factory Ltd',
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Dashboard and workforce summary test',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $admin = User::factory()->create(['email_verified_at' => now()]);
        $agent = User::factory()->create(['email_verified_at' => now()]);

        $agent->update([
            'internal_role' => 'agent',
            'onboarding_status' => 'active',
            'is_active' => true,
        ]);

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
        ]);

        return [$company, $admin, $agent];
    }
}
