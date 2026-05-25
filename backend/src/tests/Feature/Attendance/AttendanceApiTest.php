<?php

declare(strict_types=1);

namespace Tests\Feature\Attendance;

use App\Models\AttendancePayrollSummary;
use App\Models\AttendanceRecord;
use App\Models\AttendanceSetting;
use App\Models\Company;
use App\Models\PayrollSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AttendanceApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_management_can_upsert_attendance_settings(): void
    {
        [$company, $owner] = $this->seedCompanyUsers();

        $response = $this->actingAs($owner, 'sanctum')
            ->putJson('/api/v1/attendance/settings', [
                'company_id' => $company->company_id,
                'opening_time' => '09:00',
                'closing_time' => '17:00',
                'working_days' => ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
                'clockin_window_minutes' => 15,
                'auto_clockout_enabled' => true,
            ]);

        $response->assertOk()
            ->assertJsonPath('data.settings.company_id', $company->id)
            ->assertJsonPath('data.settings.opening_time', '09:00:00')
            ->assertJsonPath('data.settings.closing_time', '17:00:00')
            ->assertJsonPath('data.settings.clockin_window_minutes', 15)
            ->assertJsonPath('data.settings.auto_clockout_enabled', true);

        $this->assertDatabaseHas('attendance_settings', [
            'company_id' => $company->id,
            'opening_time' => '09:00:00',
            'closing_time' => '17:00:00',
            'clockin_window_minutes' => 15,
            'auto_clockout_enabled' => 1,
        ]);
    }

    public function test_agent_can_clock_in_and_clock_out_with_duration_tracking(): void
    {
        [$company,,, $agent] = $this->seedCompanyUsers();
        $this->createAttendanceSetting($company);

        $clockInResponse = $this->actingAs($agent, 'sanctum')
            ->postJson('/api/v1/attendance/clock-in', [
                'company_id' => $company->id,
                'recorded_at' => '2026-06-01 08:50:00',
            ]);

        $clockInResponse->assertCreated()
            ->assertJsonPath('data.record.status', 'present')
            ->assertJsonPath('data.record.is_late', false);

        $clockOutResponse = $this->actingAs($agent, 'sanctum')
            ->postJson('/api/v1/attendance/clock-out', [
                'company_id' => $company->id,
                'recorded_at' => '2026-06-01 16:30:00',
            ]);

        $clockOutResponse->assertOk()
            ->assertJsonPath('data.record.work_duration_minutes', 460);

        $this->assertDatabaseHas('attendance_records', [
            'company_id' => $company->id,
            'user_id' => $agent->id,
            'attendance_date' => '2026-06-01',
            'status' => 'present',
            'work_duration_minutes' => 460,
        ]);
    }

    public function test_agent_cannot_clock_in_twice_on_same_day(): void
    {
        [$company,,, $agent] = $this->seedCompanyUsers();
        $this->createAttendanceSetting($company);

        $this->actingAs($agent, 'sanctum')
            ->postJson('/api/v1/attendance/clock-in', [
                'company_id' => $company->id,
                'recorded_at' => '2026-06-01 08:50:00',
            ])
            ->assertCreated();

        $response = $this->actingAs($agent, 'sanctum')
            ->postJson('/api/v1/attendance/clock-in', [
                'company_id' => $company->id,
                'recorded_at' => '2026-06-01 09:05:00',
            ]);

        $response->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonStructure(['errors' => ['clock_in']]);
    }

    public function test_management_metrics_and_records_are_company_scoped(): void
    {
        [$company, $owner,, $agentA, $agentB, $otherCompany, $otherAgent] = $this->seedCompanyUsers();
        $this->createAttendanceSetting($company);
        $this->createAttendanceSetting($otherCompany);

        AttendanceRecord::query()->create([
            'company_id' => $company->id,
            'user_id' => $agentA->id,
            'attendance_date' => '2026-06-01',
            'clock_in_at' => '2026-06-01 08:55:00',
            'clock_out_at' => '2026-06-01 17:00:00',
            'status' => 'present',
            'work_duration_minutes' => 485,
            'is_late' => false,
            'is_auto_clocked_out' => false,
        ]);

        AttendanceRecord::query()->create([
            'company_id' => $otherCompany->id,
            'user_id' => $otherAgent->id,
            'attendance_date' => '2026-06-01',
            'clock_in_at' => '2026-06-01 09:00:00',
            'clock_out_at' => '2026-06-01 17:00:00',
            'status' => 'present',
            'work_duration_minutes' => 480,
            'is_late' => false,
            'is_auto_clocked_out' => false,
        ]);

        $metrics = $this->actingAs($owner, 'sanctum')
            ->getJson('/api/v1/attendance/metrics?company_id=' . $company->id . '&date=2026-06-01');

        $metrics->assertOk()
            ->assertJsonPath('data.total_workforce', 2)
            ->assertJsonPath('data.present', 1)
            ->assertJsonPath('data.absent', 1);

        $records = $this->actingAs($owner, 'sanctum')
            ->getJson('/api/v1/attendance/records?company_id=' . $company->id . '&date=2026-06-01&per_page=20');

        $records->assertOk()
            ->assertJsonCount(2, 'data.items');

        $statuses = collect($records->json('data.items'))->pluck('status')->all();
        $this->assertContains('present', $statuses);
        $this->assertContains('absent', $statuses);

        $this->assertDatabaseMissing('attendance_records', [
            'company_id' => $company->id,
            'user_id' => $otherAgent->id,
            'attendance_date' => '2026-06-01',
        ]);

        $this->assertDatabaseHas('company_users', [
            'company_id' => $company->id,
            'user_id' => $agentB->id,
            'role' => 'agent',
        ]);
    }

    public function test_management_records_support_role_and_expanded_status_filters_and_avatar_url(): void
    {
        [$company, $owner, $supervisor, $agentA, $agentB] = $this->seedCompanyUsers();
        $this->createAttendanceSetting($company);

        $agentA->update([
            'avatar' => 'male_01',
            'internal_role' => 'agent',
            'assigned_zone' => 'Ikeja LGA',
        ]);

        $supervisor->update([
            'avatar' => 'female_01',
            'internal_role' => 'supervisor',
            'assigned_zone' => 'Surulere LGA',
        ]);

        AttendanceRecord::query()->create([
            'company_id' => $company->id,
            'user_id' => $agentA->id,
            'attendance_date' => '2026-06-01',
            'clock_in_at' => '2026-06-01 09:20:00',
            'clock_out_at' => null,
            'status' => 'late',
            'work_duration_minutes' => null,
            'is_late' => true,
            'is_auto_clocked_out' => false,
        ]);

        AttendanceRecord::query()->create([
            'company_id' => $company->id,
            'user_id' => $supervisor->id,
            'attendance_date' => '2026-06-01',
            'clock_in_at' => '2026-06-01 08:55:00',
            'clock_out_at' => '2026-06-01 17:00:00',
            'status' => 'auto_clocked_out',
            'work_duration_minutes' => 485,
            'is_late' => false,
            'is_auto_clocked_out' => true,
        ]);

        $presentResponse = $this->actingAs($owner, 'sanctum')
            ->getJson('/api/v1/attendance/records?company_id=' . $company->id . '&date=2026-06-01&status=present&per_page=10');

        $presentResponse->assertOk()
            ->assertJsonCount(2, 'data.items')
            ->assertJsonPath('data.pagination.current_page', 1)
            ->assertJsonPath('data.pagination.last_page', 1)
            ->assertJsonPath('data.pagination.total', 2);

        $firstAvatarUrl = (string) ($presentResponse->json('data.items.0.avatar_url') ?? '');
        $this->assertNotSame('', $firstAvatarUrl);

        $roleResponse = $this->actingAs($owner, 'sanctum')
            ->getJson('/api/v1/attendance/records?company_id=' . $company->id . '&date=2026-06-01&role=supervisor&per_page=10');

        $roleResponse->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.role', 'supervisor');

        $clockedOutResponse = $this->actingAs($owner, 'sanctum')
            ->getJson('/api/v1/attendance/records?company_id=' . $company->id . '&date=2026-06-01&status=clocked_out&per_page=10');

        $clockedOutResponse->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.status', 'auto_clocked_out');

        $lateResponse = $this->actingAs($owner, 'sanctum')
            ->getJson('/api/v1/attendance/records?company_id=' . $company->id . '&date=2026-06-01&status=late&per_page=10');

        $lateResponse->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.status', 'late');

        $absentResponse = $this->actingAs($owner, 'sanctum')
            ->getJson('/api/v1/attendance/records?company_id=' . $company->id . '&date=2026-06-01&status=absent&per_page=10');

        $absentResponse->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.user_id', $agentB->id)
            ->assertJsonPath('data.items.0.status', 'absent');
    }

    public function test_attendance_payroll_generation_respects_attendance_affects_pay(): void
    {
        [$company, $owner,, $agentA, $agentB] = $this->seedCompanyUsers();
        $this->createAttendanceSetting($company);
        $this->createPayrollSetting($company, attendanceAffectsPay: true, dailyPay: 100, baseSalary: 4000);

        foreach (['2026-06-01', '2026-06-02', '2026-06-03'] as $day) {
            AttendanceRecord::query()->create([
                'company_id' => $company->id,
                'user_id' => $agentA->id,
                'attendance_date' => $day,
                'clock_in_at' => $day . ' 09:00:00',
                'clock_out_at' => $day . ' 17:00:00',
                'status' => 'present',
                'work_duration_minutes' => 480,
                'is_late' => false,
                'is_auto_clocked_out' => false,
            ]);
        }

        $generateResponse = $this->actingAs($owner, 'sanctum')
            ->postJson('/api/v1/attendance/payroll-summaries/generate', [
                'company_id' => $company->id,
                'year' => 2026,
                'month' => 6,
            ]);

        $generateResponse->assertOk()
            ->assertJsonPath('data.generated_count', 2);

        $this->assertDatabaseHas('attendance_payroll_summaries', [
            'company_id' => $company->id,
            'user_id' => $agentA->id,
            'period_year' => 2026,
            'period_month' => 6,
            'attendance_days' => 3,
            'salary_payable' => '300.00',
        ]);

        $this->assertDatabaseHas('attendance_payroll_summaries', [
            'company_id' => $company->id,
            'user_id' => $agentB->id,
            'period_year' => 2026,
            'period_month' => 6,
            'attendance_days' => 0,
            'salary_payable' => '0.00',
        ]);

        $agentSummary = $this->actingAs($agentA, 'sanctum')
            ->getJson('/api/v1/attendance/payroll-summary?company_id=' . $company->id . '&year=2026&month=6');

        $agentSummary->assertOk()
            ->assertJsonPath('data.summary.salary_payable', 300)
            ->assertJsonPath('data.summary.attendance_days', 3);

        $summary = AttendancePayrollSummary::query()
            ->where('company_id', $company->id)
            ->where('user_id', $agentA->id)
            ->where('period_year', 2026)
            ->where('period_month', 6)
            ->first();

        $this->assertNotNull($summary);
    }

    private function seedCompanyUsers(): array
    {
        $company = Company::create([
            'company_id' => 'FAC-ATT-' . strtoupper((string) fake()->lexify('????')),
            'name' => 'Attendance Co',
            'country' => 'NG',
            'currency_code' => 'NGN',
            'team_size' => '11-50',
            'use_case' => 'Attendance testing',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $otherCompany = Company::create([
            'company_id' => 'FAC-ATT-OTHER-' . strtoupper((string) fake()->lexify('????')),
            'name' => 'Other Attendance Co',
            'country' => 'NG',
            'currency_code' => 'NGN',
            'team_size' => '11-50',
            'use_case' => 'Attendance isolation testing',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $owner = User::factory()->create(['internal_role' => null, 'is_active' => true]);
        $supervisor = User::factory()->create(['internal_role' => 'supervisor', 'is_active' => true]);
        $agentA = User::factory()->create(['internal_role' => 'agent', 'is_active' => true]);
        $agentB = User::factory()->create(['internal_role' => 'agent', 'is_active' => true]);
        $otherAgent = User::factory()->create(['internal_role' => 'agent', 'is_active' => true]);

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
                'user_id' => $agentA->id,
                'role' => 'agent',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'company_id' => $company->id,
                'user_id' => $agentB->id,
                'role' => 'agent',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'company_id' => $otherCompany->id,
                'user_id' => $otherAgent->id,
                'role' => 'agent',
                'joined_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        return [$company, $owner, $supervisor, $agentA, $agentB, $otherCompany, $otherAgent];
    }

    private function createAttendanceSetting(Company $company): AttendanceSetting
    {
        return AttendanceSetting::query()->create([
            'company_id' => $company->id,
            'opening_time' => '09:00:00',
            'closing_time' => '17:00:00',
            'working_days' => ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
            'clockin_window_minutes' => 15,
            'auto_clockout_enabled' => true,
        ]);
    }

    private function createPayrollSetting(Company $company, bool $attendanceAffectsPay, float $dailyPay, float $baseSalary): PayrollSetting
    {
        return PayrollSetting::query()->create([
            'company_id' => $company->id,
            'salary_type' => 'monthly',
            'base_salary' => $baseSalary,
            'currency' => 'NGN',
            'work_days' => 22,
            'work_hours' => 8,
            'daily_pay' => $dailyPay,
            'attendance_affects_pay' => $attendanceAffectsPay,
            'commission_enabled' => false,
        ]);
    }
}
