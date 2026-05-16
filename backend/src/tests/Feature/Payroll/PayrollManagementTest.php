<?php

declare(strict_types=1);

namespace Tests\Feature\Payroll;

use App\Models\Company;
use App\Models\PayrollSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PayrollManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_create_payroll_settings(): void
    {
        [$company, $admin] = $this->seedCompanyUsers();

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/payroll', [
                'company_id' => $company->id,
                'salary_type' => 'monthly',
                'base_salary' => 120000,
                'work_days' => 22,
                'work_hours' => 8,
                'attendance_affects_pay' => false,
                'commission_enabled' => true,
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.payroll.company_id', $company->id)
            ->assertJsonPath('data.payroll.salary_type', 'monthly')
            ->assertJsonPath('data.payroll.currency', 'NGN')
            ->assertJsonPath('data.payroll.daily_pay', 5454.55);

        $this->assertDatabaseHas('payroll_settings', [
            'company_id' => $company->id,
            'salary_type' => 'monthly',
            'base_salary' => '120000.00',
            'work_days' => 22,
            'work_hours' => 8,
            'daily_pay' => '5454.55',
            'attendance_affects_pay' => 0,
            'commission_enabled' => 1,
        ]);
    }

    public function test_admin_can_create_payroll_settings_with_public_company_id(): void
    {
        [$company, $admin] = $this->seedCompanyUsers();

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/payroll', [
                'company_id' => strtolower($company->company_id),
                'salary_type' => 'monthly',
                'base_salary' => 120000,
                'work_days' => 22,
                'work_hours' => 8,
                'attendance_affects_pay' => false,
                'commission_enabled' => true,
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.payroll.company_id', $company->id)
            ->assertJsonPath('data.payroll.salary_type', 'monthly')
            ->assertJsonPath('data.payroll.daily_pay', 5454.55);

        $this->assertDatabaseHas('payroll_settings', [
            'company_id' => $company->id,
            'salary_type' => 'monthly',
        ]);
    }

    public function test_owner_can_create_and_update_payroll_settings(): void
    {
        [$company,,,, $owner] = $this->seedCompanyUsers();

        $createResponse = $this->actingAs($owner, 'sanctum')
            ->postJson('/api/v1/payroll', [
                'company_id' => $company->company_id,
                'salary_type' => 'monthly',
                'base_salary' => 130000,
                'work_days' => 22,
                'work_hours' => 8,
                'attendance_affects_pay' => true,
                'commission_enabled' => false,
            ]);

        $createResponse->assertCreated()
            ->assertJsonPath('data.payroll.company_id', $company->id)
            ->assertJsonPath('data.payroll.salary_type', 'monthly');

        $payrollSettingId = (int) $createResponse->json('data.payroll.id');

        $updateResponse = $this->actingAs($owner, 'sanctum')
            ->putJson('/api/v1/payroll/' . $payrollSettingId, [
                'company_id' => $company->company_id,
                'salary_type' => 'weekly',
                'base_salary' => 88000,
                'currency' => 'NGN',
                'work_days' => 20,
                'work_hours' => 8,
                'attendance_affects_pay' => false,
                'commission_enabled' => true,
            ]);

        $updateResponse->assertOk()
            ->assertJsonPath('data.payroll.salary_type', 'weekly')
            ->assertJsonPath('data.payroll.base_salary', 88000)
            ->assertJsonPath('data.payroll.daily_pay', 4400)
            ->assertJsonPath('data.payroll.commission_enabled', true);

        $this->assertDatabaseHas('payroll_settings', [
            'id' => $payrollSettingId,
            'company_id' => $company->id,
            'salary_type' => 'weekly',
            'base_salary' => '88000.00',
            'daily_pay' => '4400.00',
        ]);
    }

    public function test_payroll_creation_uses_defaults_for_work_days_and_work_hours(): void
    {
        [$company, $admin] = $this->seedCompanyUsers();

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/payroll', [
                'company_id' => $company->id,
                'salary_type' => 'weekly',
                'base_salary' => 50000,
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.payroll.work_days', 22)
            ->assertJsonPath('data.payroll.work_hours', 8)
            ->assertJsonPath('data.payroll.daily_pay', 2272.73);
    }

    public function test_supervisor_can_update_payroll_settings(): void
    {
        [$company, $admin, $supervisor] = $this->seedCompanyUsers();

        $setting = $this->createPayrollSetting($company, [
            'salary_type' => 'monthly',
            'base_salary' => 120000,
            'work_days' => 22,
            'work_hours' => 8,
            'daily_pay' => 5454.55,
        ]);

        $response = $this->actingAs($supervisor, 'sanctum')
            ->putJson('/api/v1/payroll/' . $setting->id, [
                'company_id' => $company->id,
                'salary_type' => 'weekly',
                'base_salary' => 90000,
                'currency' => 'NGN',
                'work_days' => 18,
                'work_hours' => 10,
                'attendance_affects_pay' => true,
                'commission_enabled' => true,
            ]);

        $response->assertOk()
            ->assertJsonPath('data.payroll.salary_type', 'weekly')
            ->assertJsonPath('data.payroll.base_salary', 90000)
            ->assertJsonPath('data.payroll.daily_pay', 5000)
            ->assertJsonPath('data.payroll.work_hours', 10)
            ->assertJsonPath('data.payroll.attendance_affects_pay', true)
            ->assertJsonPath('data.payroll.commission_enabled', true);

        $this->assertDatabaseHas('payroll_settings', [
            'id' => $setting->id,
            'company_id' => $company->id,
            'salary_type' => 'weekly',
            'base_salary' => '90000.00',
            'work_days' => 18,
            'work_hours' => 10,
            'daily_pay' => '5000.00',
            'attendance_affects_pay' => 1,
            'commission_enabled' => 1,
        ]);
    }

    public function test_supervisor_can_update_payroll_settings_with_public_company_id(): void
    {
        [$company,, $supervisor] = $this->seedCompanyUsers();

        $setting = $this->createPayrollSetting($company, [
            'salary_type' => 'monthly',
            'base_salary' => 120000,
            'work_days' => 22,
            'work_hours' => 8,
            'daily_pay' => 5454.55,
        ]);

        $response = $this->actingAs($supervisor, 'sanctum')
            ->putJson('/api/v1/payroll/' . $setting->id, [
                'company_id' => strtolower($company->company_id),
                'salary_type' => 'weekly',
                'base_salary' => 80000,
                'currency' => 'NGN',
                'work_days' => 20,
                'work_hours' => 8,
                'attendance_affects_pay' => false,
                'commission_enabled' => true,
            ]);

        $response->assertOk()
            ->assertJsonPath('data.payroll.salary_type', 'weekly')
            ->assertJsonPath('data.payroll.base_salary', 80000)
            ->assertJsonPath('data.payroll.daily_pay', 4000)
            ->assertJsonPath('data.payroll.commission_enabled', true);

        $this->assertDatabaseHas('payroll_settings', [
            'id' => $setting->id,
            'company_id' => $company->id,
            'salary_type' => 'weekly',
            'base_salary' => '80000.00',
            'daily_pay' => '4000.00',
            'commission_enabled' => 1,
        ]);
    }

    public function test_daily_pay_is_recalculated_when_base_salary_or_work_days_change(): void
    {
        [$company, $admin] = $this->seedCompanyUsers();

        $setting = $this->createPayrollSetting($company, [
            'base_salary' => 120000,
            'work_days' => 22,
            'daily_pay' => 5454.55,
        ]);

        $response = $this->actingAs($admin, 'sanctum')
            ->putJson('/api/v1/payroll/' . $setting->id, [
                'company_id' => $company->id,
                'salary_type' => 'monthly',
                'base_salary' => 100000,
                'currency' => 'NGN',
                'work_days' => 20,
                'work_hours' => 8,
                'attendance_affects_pay' => false,
                'commission_enabled' => false,
            ]);

        $response->assertOk()
            ->assertJsonPath('data.payroll.daily_pay', 5000);

        $this->assertDatabaseHas('payroll_settings', [
            'id' => $setting->id,
            'daily_pay' => '5000.00',
        ]);
    }

    public function test_agent_inherits_company_payroll_configuration(): void
    {
        [$company, $admin,, $agent] = $this->seedCompanyUsers();

        $this->createPayrollSetting($company, [
            'salary_type' => 'monthly',
            'base_salary' => 120000,
            'work_days' => 22,
            'work_hours' => 8,
            'daily_pay' => 5454.55,
            'attendance_affects_pay' => false,
            'commission_enabled' => true,
        ]);

        $response = $this->actingAs($agent, 'sanctum')
            ->getJson('/api/v1/payroll?company_id=' . $company->id);

        $response->assertOk()
            ->assertJsonPath('data.payroll.salary_type', 'monthly')
            ->assertJsonPath('data.payroll.base_salary', 120000)
            ->assertJsonPath('data.payroll.daily_pay', 5454.55)
            ->assertJsonPath('data.payroll.commission_enabled', true);
    }

    public function test_agent_can_fetch_payroll_with_public_company_id(): void
    {
        [$company,,, $agent] = $this->seedCompanyUsers();

        $this->createPayrollSetting($company, [
            'salary_type' => 'monthly',
            'base_salary' => 120000,
            'work_days' => 22,
            'work_hours' => 8,
            'daily_pay' => 5454.55,
            'attendance_affects_pay' => false,
            'commission_enabled' => true,
        ]);

        $response = $this->actingAs($agent, 'sanctum')
            ->getJson('/api/v1/payroll?company_id=' . strtolower($company->company_id));

        $response->assertOk()
            ->assertJsonPath('data.payroll.salary_type', 'monthly')
            ->assertJsonPath('data.payroll.base_salary', 120000)
            ->assertJsonPath('data.payroll.daily_pay', 5454.55)
            ->assertJsonPath('data.payroll.commission_enabled', true);
    }

    public function test_get_payroll_returns_null_when_not_configured(): void
    {
        [$company,,, $agent] = $this->seedCompanyUsers();

        $response = $this->actingAs($agent, 'sanctum')
            ->getJson('/api/v1/payroll?company_id=' . $company->id);

        $response->assertOk()
            ->assertJsonPath('data.payroll', null);
    }

    public function test_agent_cannot_create_or_update_payroll_settings(): void
    {
        [$company, $admin,, $agent] = $this->seedCompanyUsers();

        $setting = $this->createPayrollSetting($company);

        $createResponse = $this->actingAs($agent, 'sanctum')
            ->postJson('/api/v1/payroll', [
                'company_id' => $company->id,
                'salary_type' => 'monthly',
                'base_salary' => 150000,
                'work_days' => 22,
                'work_hours' => 8,
            ]);

        $createResponse->assertUnprocessable()
            ->assertJsonPath('errors.authorization.0', 'Only owners, admins, and supervisors can manage payroll settings.');

        $updateResponse = $this->actingAs($agent, 'sanctum')
            ->putJson('/api/v1/payroll/' . $setting->id, [
                'company_id' => $company->id,
                'salary_type' => 'monthly',
                'base_salary' => 120000,
                'currency' => 'NGN',
                'work_days' => 22,
                'work_hours' => 8,
                'attendance_affects_pay' => false,
                'commission_enabled' => false,
            ]);

        $updateResponse->assertUnprocessable()
            ->assertJsonPath('errors.authorization.0', 'Only owners, admins, and supervisors can manage payroll settings.');
    }

    public function test_payroll_settings_are_company_isolated_for_fetch_and_update(): void
    {
        [$companyA,, $supervisorA] = $this->seedCompanyUsers('FAC-PAY-A');
        [$companyB, $adminB] = $this->seedCompanyUsers('FAC-PAY-B');

        $settingB = $this->actingAs($adminB, 'sanctum')
            ->postJson('/api/v1/payroll', [
                'company_id' => $companyB->id,
                'salary_type' => 'monthly',
                'base_salary' => 200000,
                'work_days' => 22,
                'work_hours' => 8,
            ])
            ->assertCreated()
            ->json('data.payroll.id');

        $fetchResponse = $this->actingAs($supervisorA, 'sanctum')
            ->getJson('/api/v1/payroll?company_id=' . $companyB->id);

        $fetchResponse->assertUnprocessable()
            ->assertJsonValidationErrors(['company_id']);

        $updateResponse = $this->actingAs($supervisorA, 'sanctum')
            ->putJson('/api/v1/payroll/' . $settingB, [
                'company_id' => $companyA->id,
                'salary_type' => 'weekly',
                'base_salary' => 100000,
                'currency' => 'NGN',
                'work_days' => 20,
                'work_hours' => 8,
                'attendance_affects_pay' => false,
                'commission_enabled' => false,
            ]);

        $updateResponse->assertUnprocessable()
            ->assertJsonPath('errors.payroll.0', 'Payroll settings do not belong to the active company context.');
    }

    public function test_company_can_only_have_one_payroll_settings_record(): void
    {
        [$company, $admin] = $this->seedCompanyUsers();

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/payroll', [
                'company_id' => $company->id,
                'salary_type' => 'monthly',
                'base_salary' => 100000,
                'work_days' => 22,
                'work_hours' => 8,
            ])
            ->assertCreated();

        $duplicateResponse = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/payroll', [
                'company_id' => $company->id,
                'salary_type' => 'weekly',
                'base_salary' => 80000,
                'work_days' => 20,
                'work_hours' => 7,
            ]);

        $duplicateResponse->assertUnprocessable()
            ->assertJsonPath('errors.payroll.0', 'Payroll settings already exist for this company.');
    }

    public function test_create_payroll_validates_positive_values(): void
    {
        [$company, $admin] = $this->seedCompanyUsers();

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/payroll', [
                'company_id' => $company->id,
                'salary_type' => 'monthly',
                'base_salary' => 0,
                'work_days' => 0,
                'work_hours' => 3,
            ]);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['base_salary', 'work_days', 'work_hours']);
    }

    public function test_create_and_update_payroll_require_company_context(): void
    {
        [$company, $admin] = $this->seedCompanyUsers();

        $createResponse = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/payroll', [
                'salary_type' => 'monthly',
                'base_salary' => 120000,
                'work_days' => 22,
                'work_hours' => 8,
            ]);

        $createResponse->assertUnprocessable()
            ->assertJsonValidationErrors(['company_id']);

        $setting = $this->createPayrollSetting($company);

        $updateResponse = $this->actingAs($admin, 'sanctum')
            ->putJson('/api/v1/payroll/' . $setting->id, [
                'salary_type' => 'weekly',
                'base_salary' => 90000,
            ]);

        $updateResponse->assertUnprocessable()
            ->assertJsonValidationErrors(['company_id']);
    }

    public function test_partial_update_preserves_existing_boolean_and_schedule_values(): void
    {
        [$company, $admin] = $this->seedCompanyUsers();

        $setting = $this->createPayrollSetting($company, [
            'salary_type' => 'monthly',
            'base_salary' => 120000,
            'work_days' => 20,
            'work_hours' => 10,
            'daily_pay' => 6000,
            'attendance_affects_pay' => true,
            'commission_enabled' => true,
        ]);

        $response = $this->actingAs($admin, 'sanctum')
            ->putJson('/api/v1/payroll/' . $setting->id, [
                'company_id' => $company->id,
                'base_salary' => 126000,
            ]);

        $response->assertOk()
            ->assertJsonPath('data.payroll.salary_type', 'monthly')
            ->assertJsonPath('data.payroll.base_salary', 126000)
            ->assertJsonPath('data.payroll.work_days', 20)
            ->assertJsonPath('data.payroll.work_hours', 10)
            ->assertJsonPath('data.payroll.daily_pay', 6300)
            ->assertJsonPath('data.payroll.attendance_affects_pay', true)
            ->assertJsonPath('data.payroll.commission_enabled', true);

        $this->assertDatabaseHas('payroll_settings', [
            'id' => $setting->id,
            'base_salary' => '126000.00',
            'work_days' => 20,
            'work_hours' => 10,
            'daily_pay' => '6300.00',
            'attendance_affects_pay' => 1,
            'commission_enabled' => 1,
        ]);
    }

    private function seedCompanyUsers(string $companyId = 'FAC-PAY001'): array
    {
        $company = Company::create([
            'company_id' => $companyId,
            'name' => 'Payroll Test Company ' . $companyId,
            'country' => 'NG',
            'currency_code' => 'NGN',
            'team_size' => '11-50',
            'use_case' => 'Payroll management validation',
            'status' => 'active',
            'activated_at' => now(),
        ]);

        $admin = User::factory()->create(['email_verified_at' => now()]);
        $supervisor = User::factory()->create(['email_verified_at' => now()]);
        $agent = User::factory()->create(['email_verified_at' => now()]);
        $owner = User::factory()->create(['email_verified_at' => now()]);

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
                'user_id' => $admin->id,
                'role' => 'admin',
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

        return [$company, $admin, $supervisor, $agent, $owner];
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function createPayrollSetting(Company $company, array $overrides = []): PayrollSetting
    {
        return PayrollSetting::query()->create(array_merge([
            'company_id' => $company->id,
            'salary_type' => 'monthly',
            'base_salary' => 120000,
            'currency' => 'NGN',
            'work_days' => 22,
            'work_hours' => 8,
            'daily_pay' => 5454.55,
            'attendance_affects_pay' => false,
            'commission_enabled' => false,
        ], $overrides));
    }
}
