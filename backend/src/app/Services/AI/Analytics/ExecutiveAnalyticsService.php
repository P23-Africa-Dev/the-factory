<?php

declare(strict_types=1);

namespace App\Services\AI\Analytics;

use App\Models\User;
use App\Services\Attendance\AttendanceService;
use App\Services\Company\CompanyContextService;
use App\Services\Dashboard\DashboardAggregateService;
use App\Services\Payroll\PayrollService;

class ExecutiveAnalyticsService
{
    public function __construct(
        private readonly CompanyContextService $companyContextService,
        private readonly DashboardAggregateService $dashboardAggregateService,
        private readonly PayrollService $payrollService,
        private readonly AttendanceService $attendanceService,
    ) {}

    public function contextPack(User $user, ?int $companyId = null, ?string $fromDate = null, ?string $toDate = null): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $role = (string) $context['role'];

        $dashboardOverview = $this->dashboardAggregateService->overview(
            user: $user,
            companyId: $resolvedCompanyId,
            fromDate: $fromDate,
            toDate: $toDate,
        );

        $payrollOverview = $this->payrollService->overview($user, [
            'company_id' => $resolvedCompanyId,
        ]);

        $attendanceToday = $role === 'agent'
            ? $this->attendanceService->todayForAgent($user, $resolvedCompanyId)
            : $this->attendanceService->metricsForManagement($user, [
                'company_id' => $resolvedCompanyId,
                'date' => now()->toDateString(),
            ]);

        return [
            'company_id' => $resolvedCompanyId,
            'role' => $role,
            'generated_at' => now()->toIso8601String(),
            'range' => [
                'from_date' => $fromDate,
                'to_date' => $toDate,
            ],
            'dashboard_overview' => $dashboardOverview,
            'payroll_overview' => $payrollOverview,
            'attendance_today' => $attendanceToday,
        ];
    }
}
