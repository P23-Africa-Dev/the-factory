<?php

declare(strict_types=1);

namespace Tests\Feature\AI;

use App\Jobs\GenerateWeeklyExecutiveSummaryJob;
use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\TestCase;

final class CopilotExecutiveReportingTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_build_executive_context_pack(): void
    {
        [$company, $admin] = $this->seedCompanyUser('admin');

        $response = $this
            ->actingAs($admin)
            ->getJson('/api/v1/copilot/analytics/context-pack?company_id=' . $company->id);

        $response
            ->assertOk()
            ->assertJsonPath('data.company_id', $company->id)
            ->assertJsonPath('data.role', 'admin')
            ->assertJsonStructure([
                'data' => [
                    'dashboard_overview',
                    'payroll_overview',
                    'attendance_today',
                ],
            ]);
    }

    public function test_weekly_summary_queue_endpoint_dispatches_job(): void
    {
        Queue::fake();

        [$company, $admin] = $this->seedCompanyUser('admin');

        $response = $this
            ->actingAs($admin)
            ->postJson('/api/v1/copilot/reports/weekly-summary', [
                'company_id' => $company->id,
            ]);

        $response
            ->assertStatus(202)
            ->assertJsonPath('data.company_id', $company->id)
            ->assertJsonPath('data.report_id', $response->json('data.report_id'));

        Queue::assertPushed(GenerateWeeklyExecutiveSummaryJob::class);

        $statusResponse = $this
            ->actingAs($admin)
            ->getJson('/api/v1/copilot/reports/weekly-summary/' . $response->json('data.report_id') . '?company_id=' . $company->id);

        $statusResponse
            ->assertOk()
            ->assertJsonPath('data.status', 'queued')
            ->assertJsonPath('data.download_ready', false);
    }

    /**
     * @return array{0: Company, 1: User}
     */
    private function seedCompanyUser(string $role): array
    {
        $company = Company::query()->create([
            'company_id' => strtoupper(Str::random(10)),
            'name' => 'Factory ' . Str::upper(Str::random(4)),
            'country' => 'NG',
            'team_size' => '11-50',
            'use_case' => 'Operations management',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        /** @var User $user */
        $user = User::factory()->createOne();

        $company->users()->attach($user->id, [
            'role' => $role,
            'joined_at' => now(),
        ]);

        return [$company, $user];
    }
}
