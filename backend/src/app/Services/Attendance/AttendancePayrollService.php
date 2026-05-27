<?php

declare(strict_types=1);

namespace App\Services\Attendance;

use App\Enums\AttendanceStatus;
use App\Enums\NotificationCategory;
use App\Enums\NotificationPriority;
use App\Models\AttendancePayrollSummary;
use App\Models\AttendanceRecord;
use App\Models\AttendanceSetting;
use App\Models\PayrollSetting;
use App\Models\User;
use App\Services\Notification\NotificationService;
use Carbon\Carbon;
use Illuminate\Contracts\Pagination\Paginator;
use Illuminate\Support\Facades\DB;

class AttendancePayrollService
{
    private const DEFAULT_WORKING_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

    public function __construct(
        private readonly AttendanceAccessService $attendanceAccessService,
        private readonly NotificationService $notificationService,
    ) {}

    public function listForManagement(User $user, array $filters): Paginator
    {
        $context = $this->attendanceAccessService->resolve($user, $filters['company_id'] ?? null);
        $this->attendanceAccessService->ensureCanManage($context);

        $year = (int) $filters['year'];
        $month = (int) $filters['month'];

        $this->generateForCompanyPeriod((int) $context->company->id, $year, $month, (int) $user->id);

        return AttendancePayrollSummary::query()
            ->with('user:id,name,avatar')
            ->where('company_id', $context->company->id)
            ->where('cycle_type', 'monthly')
            ->where('period_year', $year)
            ->where('period_month', $month)
            ->latest('id')
            ->simplePaginate((int) ($filters['per_page'] ?? 20))
            ->withQueryString();
    }

    public function mySummary(User $user, array $filters): ?AttendancePayrollSummary
    {
        $context = $this->attendanceAccessService->resolve($user, $filters['company_id'] ?? null);
        $this->attendanceAccessService->ensureAgent($context);

        $year = (int) $filters['year'];
        $month = (int) $filters['month'];

        $this->generateForCompanyPeriod((int) $context->company->id, $year, $month, null);

        return AttendancePayrollSummary::query()
            ->with('user:id,name,avatar')
            ->where('company_id', $context->company->id)
            ->where('user_id', $user->id)
            ->where('cycle_type', 'monthly')
            ->where('period_year', $year)
            ->where('period_month', $month)
            ->first();
    }

    public function generateForManager(User $user, array $filters): array
    {
        $context = $this->attendanceAccessService->resolve($user, $filters['company_id'] ?? null);
        $this->attendanceAccessService->ensureCanManage($context);

        $year = (int) $filters['year'];
        $month = (int) $filters['month'];

        $generatedCount = $this->generateForCompanyPeriod((int) $context->company->id, $year, $month, (int) $user->id);

        return [
            'company_id' => (int) $context->company->id,
            'year' => $year,
            'month' => $month,
            'generated_count' => $generatedCount,
        ];
    }

    public function generatePreviousMonthForAllCompanies(?Carbon $anchorDate = null): int
    {
        $anchor = $anchorDate?->copy() ?? now();
        $period = $anchor->copy()->subMonthNoOverflow();

        return $this->generateForAllCompaniesPeriod((int) $period->year, (int) $period->month);
    }

    public function generateForAllCompaniesPeriod(int $year, int $month): int
    {
        $period = Carbon::create($year, $month, 1);

        $companies = PayrollSetting::query()->pluck('company_id')->unique()->values();
        $generated = 0;

        foreach ($companies as $companyId) {
            $generated += $this->generateForCompanyPeriod((int) $companyId, (int) $period->year, (int) $period->month, null);
        }

        return $generated;
    }

    public function generateForCompanyPeriod(int $companyId, int $year, int $month, ?int $actorUserId): int
    {
        $periodStart = Carbon::create($year, $month, 1)->startOfMonth();
        $periodEnd = $periodStart->copy()->endOfMonth();

        $payrollSetting = PayrollSetting::query()
            ->where('company_id', $companyId)
            ->first();

        if (! $payrollSetting) {
            return 0;
        }

        $attendanceSetting = AttendanceSetting::query()
            ->where('company_id', $companyId)
            ->first();

        $workingDays = $attendanceSetting?->working_days ?? self::DEFAULT_WORKING_DAYS;
        $scheduledWorkingDays = $this->countScheduledWorkingDays($periodStart, $periodEnd, $workingDays);

        $agentIds = DB::table('company_users as cu')
            ->join('users as u', 'u.id', '=', 'cu.user_id')
            ->where('cu.company_id', $companyId)
            ->where('cu.role', 'agent')
            ->whereNull('u.deleted_at')
            ->pluck('u.id')
            ->map(static fn(mixed $id): int => (int) $id)
            ->all();

        $generatedCount = 0;

        foreach ($agentIds as $agentId) {
            $attendanceDays = AttendanceRecord::query()
                ->where('company_id', $companyId)
                ->where('user_id', $agentId)
                ->whereBetween('attendance_date', [$periodStart->toDateString(), $periodEnd->toDateString()])
                ->whereIn('status', [
                    AttendanceStatus::PRESENT->value,
                    AttendanceStatus::LATE->value,
                    AttendanceStatus::AUTO_CLOCKED_OUT->value,
                ])
                ->count();

            $dailyRate = (float) $payrollSetting->daily_pay;

            $salaryPayable = $payrollSetting->attendance_affects_pay
                ? round($dailyRate * $attendanceDays, 2)
                : round((float) $payrollSetting->base_salary, 2);

            AttendancePayrollSummary::query()->updateOrCreate(
                [
                    'company_id' => $companyId,
                    'user_id' => $agentId,
                    'cycle_type' => 'monthly',
                    'period_year' => $year,
                    'period_month' => $month,
                ],
                [
                    'payroll_setting_id' => (int) $payrollSetting->id,
                    'period_start' => $periodStart->toDateString(),
                    'period_end' => $periodEnd->toDateString(),
                    'attendance_days' => $payrollSetting->attendance_affects_pay
                        ? $attendanceDays
                        : $scheduledWorkingDays,
                    'scheduled_work_days' => $scheduledWorkingDays,
                    'daily_rate' => $dailyRate,
                    'salary_payable' => $salaryPayable,
                    'currency' => (string) $payrollSetting->currency,
                    'generated_at' => now(),
                    'metadata' => [
                        'attendance_affects_pay' => (bool) $payrollSetting->attendance_affects_pay,
                        'actual_attendance_days' => $attendanceDays,
                        'actor_user_id' => $actorUserId,
                    ],
                ],
            );

            $this->notificationService->notifyUser($agentId, [
                'company_id' => $companyId,
                'type' => 'payroll.monthly_salary_generated',
                'category' => NotificationCategory::PAYROLL->value,
                'title' => 'Monthly salary summary generated',
                'message' => 'Your monthly salary attendance summary has been generated.',
                'reference_type' => AttendancePayrollSummary::class,
                'reference_id' => null,
                'action_url' => '/payroll',
                'action_route' => 'attendance.me.payroll-summary',
                'priority' => NotificationPriority::HIGH->value,
                'created_by_user_id' => $actorUserId,
                'metadata' => [
                    'period_year' => $year,
                    'period_month' => $month,
                    'salary_payable' => $salaryPayable,
                    'currency' => (string) $payrollSetting->currency,
                ],
                'dedupe_key' => 'payroll-monthly-summary:' . $companyId . ':' . $agentId . ':' . $year . '-' . $month,
            ]);

            $generatedCount++;
        }

        return $generatedCount;
    }

    private function countScheduledWorkingDays(Carbon $start, Carbon $end, array $workingDays): int
    {
        $normalized = collect($workingDays)
            ->map(static fn(mixed $day): string => strtolower((string) $day))
            ->filter()
            ->unique()
            ->values()
            ->all();

        if ($normalized === []) {
            $normalized = self::DEFAULT_WORKING_DAYS;
        }

        $cursor = $start->copy()->startOfDay();
        $last = $end->copy()->startOfDay();
        $count = 0;

        while ($cursor->lte($last)) {
            if (in_array(strtolower($cursor->englishDayOfWeek), $normalized, true)) {
                $count++;
            }

            $cursor->addDay();
        }

        return $count;
    }
}
