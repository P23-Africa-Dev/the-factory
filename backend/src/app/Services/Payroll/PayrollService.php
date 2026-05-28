<?php

declare(strict_types=1);

namespace App\Services\Payroll;

use App\Enums\AttendanceStatus;
use App\Enums\NotificationCategory;
use App\Enums\NotificationPriority;
use App\Models\AttendancePayrollSummary;
use App\Models\AttendanceRecord;
use App\Models\AttendanceSetting;
use App\Models\PayrollSetting;
use App\Models\Task;
use App\Models\User;
use App\Notifications\PayrollStatusNotification;
use App\Services\Notification\NotificationService;
use App\Support\AvatarUrlResolver;
use Carbon\Carbon;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use OpenSpout\Common\Entity\Row;
use OpenSpout\Common\Entity\Style\Style;
use OpenSpout\Writer\XLSX\Writer as XlsxWriter;

class PayrollService
{
    private const EXPORT_HEADERS = [
        'Employee Name',
        'Role',
        'Salary Type',
        'Currency',
        'Base Salary',
        'Daily Pay',
        'Attendance Count',
        'Accumulated Pay',
        'Attendance Affect Pay',
        'Payroll Status',
        'Created Date',
        'Project Count',
        'Completed Tasks',
        'Pending Tasks',
    ];

    private const PRESENT_STATUSES = [
        AttendanceStatus::PRESENT->value,
        AttendanceStatus::LATE->value,
        AttendanceStatus::AUTO_CLOCKED_OUT->value,
    ];

    public function __construct(
        private readonly PayrollAccessService $accessService,
        private readonly NotificationService $notificationService,
    ) {}

    public function findForUser(User $user, ?int $companyId = null): ?PayrollSetting
    {
        $context = $this->accessService->resolve($user, $companyId);
        $this->accessService->ensureCanView($context);

        return PayrollSetting::query()
            ->where('company_id', $context->company->id)
            ->first();
    }

    public function create(User $user, array $data): PayrollSetting
    {
        $context = $this->accessService->resolve($user, $data['company_id'] ?? null);
        $this->accessService->ensureCanManage($context);

        $existing = PayrollSetting::query()
            ->where('company_id', $context->company->id)
            ->first();

        if ($existing) {
            throw ValidationException::withMessages([
                'payroll' => ['Payroll settings already exist for this company.'],
            ]);
        }

        $currency = $this->resolveCurrency(
            preferredCurrency: $data['currency'] ?? null,
            companyCurrency: $context->company->currency_code,
            fallbackCurrency: null,
        );
        $salaryType = strtolower((string) $data['salary_type']);

        $workDays = (int) $data['work_days'];
        $baseSalary = (float) $data['base_salary'];

        $setting = DB::transaction(function () use ($context, $data, $currency, $workDays, $baseSalary, $salaryType): PayrollSetting {
            return PayrollSetting::query()->create([
                'company_id' => $context->company->id,
                'salary_type' => $data['salary_type'],
                'base_salary' => $baseSalary,
                'currency' => $currency,
                'work_days' => $workDays,
                'work_hours' => (int) $data['work_hours'],
                'daily_pay' => $this->calculateDailyPay($baseSalary, $workDays, $salaryType),
                'attendance_affects_pay' => (bool) ($data['attendance_affects_pay'] ?? false),
                'commission_enabled' => (bool) ($data['commission_enabled'] ?? false),
            ]);
        });

        $this->notifyPayrollChange(
            companyId: (int) $context->company->id,
            actor: $user,
            type: 'payroll.settings_created',
            title: 'Payroll settings created',
            message: 'Payroll settings have been configured for your company.',
            priority: NotificationPriority::HIGH->value,
        );

        return $setting;
    }

    public function update(User $user, PayrollSetting $payrollSetting, array $data): PayrollSetting
    {
        $context = $this->accessService->resolve($user, $data['company_id'] ?? null);
        $this->accessService->ensureCanManage($context);
        $this->assertSettingInCompany($payrollSetting, $context->company->id);

        $workDays = (int) ($data['work_days'] ?? $payrollSetting->work_days);
        $baseSalary = (float) ($data['base_salary'] ?? $payrollSetting->base_salary);

        $currency = $this->resolveCurrency(
            preferredCurrency: $data['currency'] ?? null,
            companyCurrency: $context->company->currency_code,
            fallbackCurrency: $payrollSetting->currency,
        );
        $salaryType = strtolower((string) ($data['salary_type'] ?? $payrollSetting->salary_type?->value ?? 'monthly'));

        $payrollSetting->update([
            'salary_type' => $salaryType,
            'base_salary' => $baseSalary,
            'currency' => $currency,
            'work_days' => $workDays,
            'work_hours' => (int) ($data['work_hours'] ?? $payrollSetting->work_hours),
            'daily_pay' => $this->calculateDailyPay($baseSalary, $workDays, $salaryType),
            'attendance_affects_pay' => (bool) ($data['attendance_affects_pay'] ?? $payrollSetting->attendance_affects_pay),
            'commission_enabled' => (bool) ($data['commission_enabled'] ?? $payrollSetting->commission_enabled),
        ]);

        $this->notifyPayrollChange(
            companyId: (int) $context->company->id,
            actor: $user,
            type: 'payroll.settings_updated',
            title: 'Payroll settings updated',
            message: 'Payroll settings have been updated.',
            priority: NotificationPriority::NORMAL->value,
        );

        return $payrollSetting->fresh();
    }

    public function overview(User $user, array $filters): array
    {
        $context = $this->accessService->resolve($user, $filters['company_id'] ?? null);
        $this->accessService->ensureCanView($context);

        $companyId = (int) $context->company->id;
        $date = $this->resolveReferenceDate($filters);
        $yesterday = $date->copy()->subDay();

        $payrollSetting = PayrollSetting::query()->where('company_id', $companyId)->first();
        $attendanceSetting = AttendanceSetting::query()->where('company_id', $companyId)->first();

        $agents = $this->agentsQuery($companyId)->get();
        $agentsById = $agents->keyBy('id');

        $todayPresentIds = AttendanceRecord::query()
            ->where('company_id', $companyId)
            ->whereDate('attendance_date', $date->toDateString())
            ->whereIn('status', self::PRESENT_STATUSES)
            ->pluck('user_id')
            ->map(static fn(mixed $id): int => (int) $id)
            ->filter(static fn(int $id): bool => $id > 0)
            ->unique()
            ->values();

        $yesterdayPresentIds = AttendanceRecord::query()
            ->where('company_id', $companyId)
            ->whereDate('attendance_date', $yesterday->toDateString())
            ->whereIn('status', self::PRESENT_STATUSES)
            ->pluck('user_id')
            ->map(static fn(mixed $id): int => (int) $id)
            ->filter(static fn(int $id): bool => $id > 0)
            ->unique()
            ->values();

        $todayValue = 0.0;
        foreach ($todayPresentIds as $agentId) {
            $agent = $agentsById->get($agentId);
            if (! $agent instanceof User) {
                continue;
            }

            $todayPeriod = $this->resolvePayrollPeriod($date, $this->resolveAgentSalaryType($agent, $payrollSetting));
            $effective = $this->resolveEffectivePayrollProfile(
                agent: $agent,
                payrollSetting: $payrollSetting,
                attendanceSetting: $attendanceSetting,
                periodStart: $todayPeriod['period_start'],
                periodEnd: $todayPeriod['period_end'],
            );

            $todayValue += (float) $effective['daily_pay'];
        }

        $yesterdayValue = 0.0;
        foreach ($yesterdayPresentIds as $agentId) {
            $agent = $agentsById->get($agentId);
            if (! $agent instanceof User) {
                continue;
            }

            $yesterdayPeriod = $this->resolvePayrollPeriod($yesterday, $this->resolveAgentSalaryType($agent, $payrollSetting));
            $effective = $this->resolveEffectivePayrollProfile(
                agent: $agent,
                payrollSetting: $payrollSetting,
                attendanceSetting: $attendanceSetting,
                periodStart: $yesterdayPeriod['period_start'],
                periodEnd: $yesterdayPeriod['period_end'],
            );

            $yesterdayValue += (float) $effective['daily_pay'];
        }

        $totalPayroll = 0.0;
        $pendingApproval = 0.0;

        foreach ($agents as $agent) {
            $period = $this->resolvePayrollPeriod($date, $this->resolveAgentSalaryType($agent, $payrollSetting));
            $summary = $this->ensurePayrollSummaryForPeriod(
                companyId: $companyId,
                agent: $agent,
                payrollSetting: $payrollSetting,
                attendanceSetting: $attendanceSetting,
                period: $period,
                actorUserId: null,
            );

            $totalPayroll += (float) $summary->salary_payable;
            if ((string) $summary->status === 'pending') {
                $pendingApproval += (float) $summary->salary_payable;
            }
        }

        $todayPresentCount = $todayPresentIds
            ->filter(fn(int $agentId): bool => $agentsById->has($agentId))
            ->count();

        return [
            'date' => $date->toDateString(),
            'today_present_agents' => $todayPresentCount,
            'today_payroll_value' => round($todayValue, 2),
            'payroll_rise' => $todayValue > $yesterdayValue,
            'payroll_fall' => $todayValue < $yesterdayValue,
            'total_commission' => 0.0,
            'pending_approval' => round($pendingApproval, 2),
            'total_agents' => $agents->count(),
            'total_payroll' => round($totalPayroll, 2),
            'currency' => strtoupper((string) ($payrollSetting?->currency ?? $context->company->currency_code ?? 'NGN')),
        ];
    }

    public function listAgents(User $user, array $filters): array
    {
        $context = $this->accessService->resolve($user, $filters['company_id'] ?? null);
        $this->accessService->ensureCanView($context);

        $companyId = (int) $context->company->id;
        $date = $this->resolveReferenceDate($filters);

        $query = $this->agentsQuery($companyId);

        if ($context->role === 'agent') {
            $query->where('users.id', $user->id);
        }

        if (! empty($filters['search'])) {
            $search = '%' . trim((string) $filters['search']) . '%';
            $query->where(function ($sub) use ($search): void {
                $sub->where('users.name', 'like', $search)
                    ->orWhere('users.email', 'like', $search)
                    ->orWhere('users.assigned_zone', 'like', $search);
            });
        }

        $agents = $query->get();
        $payrollSetting = PayrollSetting::query()->where('company_id', $companyId)->first();
        $attendanceSetting = AttendanceSetting::query()->where('company_id', $companyId)->first();

        $rows = $this->buildAgentRows(
            agents: $agents,
            companyId: $companyId,
            payrollSetting: $payrollSetting,
            attendanceSetting: $attendanceSetting,
            date: $date,
            actorUserId: $context->role !== 'agent' ? (int) $user->id : null,
        );

        if (! empty($filters['status'])) {
            $needle = strtolower((string) $filters['status']);
            $rows = $rows
                ->filter(static fn(array $row): bool => strtolower((string) $row['status']) === $needle)
                ->values();
        }

        $perPage = (int) ($filters['per_page'] ?? 20);
        $page = max((int) ($filters['page'] ?? 1), 1);
        $paginated = new LengthAwarePaginator(
            items: $rows->forPage($page, $perPage)->values()->all(),
            total: $rows->count(),
            perPage: $perPage,
            currentPage: $page,
        );

        return [
            'items' => $paginated->items(),
            'pagination' => [
                'current_page' => $paginated->currentPage(),
                'last_page' => $paginated->lastPage(),
                'next_page_url' => $paginated->nextPageUrl(),
                'prev_page_url' => $paginated->previousPageUrl(),
                'per_page' => $paginated->perPage(),
                'total' => $paginated->total(),
            ],
        ];
    }

    public function profile(User $actor, int $targetUserId, array $filters): array
    {
        $context = $this->accessService->resolve($actor, $filters['company_id'] ?? null);
        $this->accessService->ensureCanView($context);

        if ($context->role === 'agent' && (int) $actor->id !== $targetUserId) {
            throw ValidationException::withMessages([
                'authorization' => ['Agents can only view their own payroll profile.'],
            ]);
        }

        $agent = $this->resolveAgentInCompany(companyId: (int) $context->company->id, agentId: $targetUserId);
        $date = $this->resolveReferenceDate($filters);

        return $this->buildAgentProfilePayload(
            companyId: (int) $context->company->id,
            agent: $agent,
            date: $date,
            actorUserId: $context->role !== 'agent' ? (int) $actor->id : null,
        );
    }

    public function updateAgentPayrollProfile(User $actor, int $agentId, array $data): array
    {
        $context = $this->accessService->resolve($actor, $data['company_id'] ?? null);
        $this->accessService->ensureCanManage($context);

        $agent = $this->resolveAgentInCompany(companyId: (int) $context->company->id, agentId: $agentId);
        $payrollSetting = PayrollSetting::query()->where('company_id', $context->company->id)->first();

        $updates = [];

        if (array_key_exists('base_salary', $data)) {
            $updates['base_salary'] = (float) $data['base_salary'];
            $updates['salary_currency'] = strtoupper((string) ($data['currency_code'] ?? $agent->salary_currency ?: $payrollSetting?->currency ?: $context->company->currency_code ?: 'NGN'));
        } elseif (array_key_exists('currency_code', $data)) {
            $updates['salary_currency'] = strtoupper((string) ($data['currency_code'] ?: $agent->salary_currency ?: $payrollSetting?->currency ?: $context->company->currency_code ?: 'NGN'));
        }

        if (array_key_exists('salary_type', $data)) {
            $updates['payroll_salary_type'] = strtolower((string) $data['salary_type']);
        }

        if (array_key_exists('attendance_affects_pay', $data)) {
            $updates['payroll_attendance_affects_pay'] = (bool) $data['attendance_affects_pay'];
        }

        if (array_key_exists('work_days_override', $data)) {
            $updates['payroll_work_days_override'] = $data['work_days_override'] !== null
                ? (int) $data['work_days_override']
                : null;
        }

        if ($updates === []) {
            throw ValidationException::withMessages([
                'payload' => ['At least one editable payroll field is required.'],
            ]);
        }

        $agent->update($updates);

        $this->notificationService->notifyUser((int) $agent->id, [
            'company_id' => (int) $context->company->id,
            'type' => 'payroll.agent_salary_updated',
            'category' => NotificationCategory::PAYROLL->value,
            'title' => 'Payroll profile updated',
            'message' => 'Your payroll profile was updated by management.',
            'reference_type' => User::class,
            'reference_id' => (int) $agent->id,
            'action_url' => '/payroll',
            'action_route' => 'payroll.agents.show',
            'priority' => NotificationPriority::HIGH->value,
            'created_by_user_id' => (int) $actor->id,
            'metadata' => [
                'updated_fields' => array_keys($updates),
            ],
            'dedupe_key' => 'payroll-agent-update:' . (int) $context->company->id . ':' . (int) $agent->id . ':' . now()->timestamp,
        ]);

        return $this->buildAgentProfilePayload(
            companyId: (int) $context->company->id,
            agent: $agent->fresh(),
            date: now(),
            actorUserId: (int) $actor->id,
        );
    }

    public function approveAgentPayroll(User $actor, int $agentId, array $data): array
    {
        $context = $this->accessService->resolve($actor, $data['company_id'] ?? null);
        $this->accessService->ensureCanManage($context);

        $agent = $this->resolveAgentInCompany(companyId: (int) $context->company->id, agentId: $agentId);
        $date = $this->resolveReferenceDate($data);
        $payrollSetting = PayrollSetting::query()->where('company_id', $context->company->id)->first();
        $attendanceSetting = AttendanceSetting::query()->where('company_id', $context->company->id)->first();
        $period = $this->resolvePayrollPeriod($date, $this->resolveAgentSalaryType($agent, $payrollSetting));

        $summary = $this->ensurePayrollSummaryForPeriod(
            companyId: (int) $context->company->id,
            agent: $agent,
            payrollSetting: $payrollSetting,
            attendanceSetting: $attendanceSetting,
            period: $period,
            actorUserId: (int) $actor->id,
        );

        $action = strtolower((string) $data['action']);
        $reason = isset($data['reason']) ? trim((string) $data['reason']) : null;

        if ($action === 'approve') {
            $summary->update([
                'status' => 'approved',
                'approved_at' => now(),
                'approved_by_user_id' => (int) $actor->id,
                'revoked_at' => null,
                'revoked_by_user_id' => null,
                'approval_reason' => $reason,
            ]);
        } else {
            $summary->update([
                'status' => 'revoked',
                'revoked_at' => now(),
                'revoked_by_user_id' => (int) $actor->id,
                'approved_at' => null,
                'approved_by_user_id' => null,
                'approval_reason' => $reason,
            ]);
        }

        $label = $this->formatPeriodLabel((string) $period['cycle_type'], $period['period_start'], $period['period_end']);
        $formattedAmount = $this->formatMoney((float) $summary->salary_payable, (string) $summary->currency);

        $this->notificationService->notifyUser((int) $agent->id, [
            'company_id' => (int) $context->company->id,
            'type' => 'payroll.status_updated',
            'category' => NotificationCategory::PAYROLL->value,
            'title' => 'Payroll status updated',
            'message' => sprintf('Your payroll for %s is now %s.', $label, ucfirst((string) $summary->status)),
            'reference_type' => AttendancePayrollSummary::class,
            'reference_id' => (int) $summary->id,
            'action_url' => '/payroll',
            'action_route' => 'payroll.agents.show',
            'priority' => NotificationPriority::HIGH->value,
            'created_by_user_id' => (int) $actor->id,
            'metadata' => [
                'period_start' => $period['period_start']->toDateString(),
                'period_end' => $period['period_end']->toDateString(),
                'status' => (string) $summary->status,
                'salary_payable' => (float) $summary->salary_payable,
                'currency' => (string) $summary->currency,
                'reason' => $reason,
            ],
            'dedupe_key' => sprintf(
                'payroll-status:%d:%d:%s:%s:%s',
                (int) $context->company->id,
                (int) $agent->id,
                $period['cycle_type'],
                $period['period_start']->toDateString(),
                (string) $summary->status,
            ),
        ]);

        $agent->notify(new PayrollStatusNotification(
            status: ucfirst((string) $summary->status),
            periodLabel: $label,
            amount: $formattedAmount,
            reason: $reason,
        ));

        return $this->buildAgentProfilePayload(
            companyId: (int) $context->company->id,
            agent: $agent->fresh(),
            date: $date,
            actorUserId: (int) $actor->id,
        );
    }

    public function exportAgents(User $user, array $filters): array
    {
        $context = $this->accessService->resolve($user, $filters['company_id'] ?? null);
        $this->accessService->ensureCanManage($context);

        $format = strtolower((string) ($filters['format'] ?? 'csv'));
        if ($format === 'xls') {
            $format = 'xlsx';
        }

        $date = $this->resolveReferenceDate($filters);
        $filename = sprintf('payroll-export-%s.%s', $date->format('Y-m-d'), $format === 'xlsx' ? 'xlsx' : 'csv');

        if ($format === 'xlsx') {
            return [
                'filename' => $filename,
                'content_type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'stream' => function () use ($context, $user, $filters): void {
                    $this->streamXlsxExport((int) $context->company->id, $user, $filters);
                },
            ];
        }

        return [
            'filename' => $filename,
            'content_type' => 'text/csv; charset=UTF-8',
            'stream' => function () use ($context, $user, $filters): void {
                $this->streamCsvExport((int) $context->company->id, $user, $filters);
            },
        ];
    }

    private function resolveCurrency(?string $preferredCurrency, ?string $companyCurrency, ?string $fallbackCurrency): string
    {
        $currency = $preferredCurrency ?: $companyCurrency ?: $fallbackCurrency;

        if (! $currency) {
            throw ValidationException::withMessages([
                'currency' => ['Currency is required either in request payload or company settings.'],
            ]);
        }

        return strtoupper((string) $currency);
    }

    private function buildAgentProfilePayload(int $companyId, User $agent, Carbon $date, ?int $actorUserId): array
    {
        $payrollSetting = PayrollSetting::query()->where('company_id', $companyId)->first();
        $attendanceSetting = AttendanceSetting::query()->where('company_id', $companyId)->first();
        $period = $this->resolvePayrollPeriod($date, $this->resolveAgentSalaryType($agent, $payrollSetting));

        $effective = $this->resolveEffectivePayrollProfile(
            agent: $agent,
            payrollSetting: $payrollSetting,
            attendanceSetting: $attendanceSetting,
            periodStart: $period['period_start'],
            periodEnd: $period['period_end'],
        );

        $summary = $this->ensurePayrollSummaryForPeriod(
            companyId: $companyId,
            agent: $agent,
            payrollSetting: $payrollSetting,
            attendanceSetting: $attendanceSetting,
            period: $period,
            actorUserId: $actorUserId,
        );

        $history = AttendancePayrollSummary::query()
            ->where('company_id', $companyId)
            ->where('user_id', $agent->id)
            ->orderByDesc('period_year')
            ->orderByDesc('period_month')
            ->orderByDesc('period_start')
            ->limit(6)
            ->get()
            ->map(static function (AttendancePayrollSummary $summary): array {
                $monthDate = Carbon::parse((string) $summary->period_start);
                $isDailyCycle = (string) $summary->cycle_type === 'daily';

                return [
                    'id' => (int) $summary->id,
                    'month' => $monthDate->format('F'),
                    'period_year' => (int) $summary->period_year,
                    'period_month' => (int) $summary->period_month,
                    'base_salary' => $isDailyCycle
                        ? round((float) $summary->daily_rate, 2)
                        : round((float) $summary->daily_rate * (int) $summary->scheduled_work_days, 2),
                    'net_pay' => round((float) $summary->salary_payable, 2),
                    'due_date' => $summary->period_end?->toDateString(),
                    'status' => ucfirst((string) $summary->status),
                ];
            })
            ->values()
            ->all();

        return [
            'id' => (int) $agent->id,
            'name' => (string) $agent->name,
            'email' => (string) $agent->email,
            'avatar_url' => AvatarUrlResolver::resolve($agent->avatar, $agent->gender) ?? '/avatars/male-avatar.png',
            'assigned_zone' => $agent->assigned_zone,
            'role' => 'Agent',
            'status' => ucfirst((string) $summary->status),
            'salary_type' => (string) $effective['salary_type'],
            'base_salary' => round((float) $effective['base_salary'], 2),
            'daily_pay' => round((float) $effective['daily_pay'], 2),
            'work_days' => (int) $effective['work_days'],
            'work_hours' => (float) $effective['work_hours'],
            'attendance_affects_pay' => (bool) $effective['attendance_affects_pay'],
            'commission_enabled' => (bool) $effective['commission_enabled'],
            'currency' => (string) $effective['currency'],
            'attendance_days' => (int) $summary->attendance_days,
            'salary_payable' => round((float) $summary->salary_payable, 2),
            'history' => $history,
        ];
    }

    private function resolveEffectivePayrollProfile(
        User $agent,
        ?PayrollSetting $payrollSetting,
        ?AttendanceSetting $attendanceSetting,
        Carbon $periodStart,
        Carbon $periodEnd,
    ): array {
        $baseSalary = $agent->base_salary !== null
            ? (float) $agent->base_salary
            : (float) ($payrollSetting?->base_salary ?? 0.0);

        $salaryType = $agent->payroll_salary_type
            ? strtolower((string) $agent->payroll_salary_type)
            : (string) ($payrollSetting?->salary_type?->value ?? 'monthly');

        $attendanceAffectsPay = $agent->payroll_attendance_affects_pay !== null
            ? (bool) $agent->payroll_attendance_affects_pay
            : (bool) ($payrollSetting?->attendance_affects_pay ?? false);

        if ($salaryType === 'daily') {
            $attendanceAffectsPay = true;
        }

        $derivedWorkDays = $this->deriveMonthlyWorkDays(
            periodStart: $periodStart,
            periodEnd: $periodEnd,
            workingDays: $attendanceSetting?->working_days,
        );

        $workDays = $agent->payroll_work_days_override !== null
            ? (int) $agent->payroll_work_days_override
            : ($derivedWorkDays ?? (int) ($payrollSetting?->work_days ?? 22));

        if ($workDays < 1) {
            $workDays = 22;
        }

        $workHours = $this->deriveWorkHours(
            attendanceSetting: $attendanceSetting,
            fallbackHours: (int) ($payrollSetting?->work_hours ?? 8),
        );

        $dailyPay = $this->calculateDailyPay($baseSalary, $workDays, $salaryType);
        $currency = strtoupper((string) ($agent->salary_currency ?: $payrollSetting?->currency ?: 'NGN'));

        return [
            'salary_type' => $salaryType,
            'base_salary' => $baseSalary,
            'daily_pay' => $dailyPay,
            'work_days' => $workDays,
            'work_hours' => $workHours,
            'attendance_affects_pay' => $attendanceAffectsPay,
            'commission_enabled' => (bool) ($agent->commission_enabled ?? $payrollSetting?->commission_enabled ?? false),
            'currency' => $currency,
        ];
    }

    private function deriveMonthlyWorkDays(Carbon $periodStart, Carbon $periodEnd, ?array $workingDays): ?int
    {
        if (! is_array($workingDays) || $workingDays === []) {
            return null;
        }

        $normalized = collect($workingDays)
            ->map(static fn(mixed $day): string => strtolower((string) $day))
            ->filter()
            ->unique()
            ->values()
            ->all();

        if ($normalized === []) {
            return null;
        }

        $cursor = $periodStart->copy()->startOfDay();
        $last = $periodEnd->copy()->startOfDay();
        $count = 0;

        while ($cursor->lte($last)) {
            if (in_array(strtolower($cursor->englishDayOfWeek), $normalized, true)) {
                $count++;
            }

            $cursor->addDay();
        }

        return $count;
    }

    private function deriveWorkHours(?AttendanceSetting $attendanceSetting, int $fallbackHours): float
    {
        if (! $attendanceSetting || ! $attendanceSetting->opening_time || ! $attendanceSetting->closing_time) {
            return (float) $fallbackHours;
        }

        $opening = Carbon::parse('1970-01-01 ' . (string) $attendanceSetting->opening_time);
        $closing = Carbon::parse('1970-01-01 ' . (string) $attendanceSetting->closing_time);
        $minutes = $opening->diffInMinutes($closing, false);

        if ($minutes <= 0) {
            return (float) $fallbackHours;
        }

        return round($minutes / 60, 2);
    }

    private function resolveReferenceDate(array $filters): Carbon
    {
        return ! empty($filters['date'])
            ? Carbon::parse((string) $filters['date'])->startOfDay()
            : now()->startOfDay();
    }

    private function resolveAgentSalaryType(User $agent, ?PayrollSetting $payrollSetting): string
    {
        return $agent->payroll_salary_type
            ? strtolower((string) $agent->payroll_salary_type)
            : (string) ($payrollSetting?->salary_type?->value ?? 'monthly');
    }

    private function resolvePayrollPeriod(Carbon $date, string $salaryType): array
    {
        $cycleType = strtolower($salaryType);
        if (! in_array($cycleType, ['daily', 'weekly', 'monthly'], true)) {
            $cycleType = 'monthly';
        }

        $periodStart = match ($cycleType) {
            'daily' => $date->copy()->startOfDay(),
            'weekly' => $date->copy()->startOfWeek(Carbon::MONDAY),
            default => $date->copy()->startOfMonth(),
        };
        $periodEnd = match ($cycleType) {
            'daily' => $date->copy()->endOfDay(),
            'weekly' => $date->copy()->endOfWeek(Carbon::SUNDAY),
            default => $date->copy()->endOfMonth(),
        };

        return [
            'cycle_type' => $cycleType,
            'period_start' => $periodStart,
            'period_end' => $periodEnd,
            'period_year' => (int) $periodStart->year,
            'period_month' => (int) $periodStart->month,
        ];
    }

    private function ensurePayrollSummaryForPeriod(
        int $companyId,
        User $agent,
        ?PayrollSetting $payrollSetting,
        ?AttendanceSetting $attendanceSetting,
        array $period,
        ?int $actorUserId,
    ): AttendancePayrollSummary {
        if (! $payrollSetting) {
            throw ValidationException::withMessages([
                'payroll' => ['Payroll settings must be configured before payroll can be reviewed or approved.'],
            ]);
        }

        $effective = $this->resolveEffectivePayrollProfile(
            agent: $agent,
            payrollSetting: $payrollSetting,
            attendanceSetting: $attendanceSetting,
            periodStart: $period['period_start'],
            periodEnd: $period['period_end'],
        );

        $attendanceDays = AttendanceRecord::query()
            ->where('company_id', $companyId)
            ->where('user_id', $agent->id)
            ->whereBetween('attendance_date', [$period['period_start']->toDateString(), $period['period_end']->toDateString()])
            ->whereIn('status', self::PRESENT_STATUSES)
            ->count();

        $salaryPayable = ($effective['attendance_affects_pay'] || (string) $effective['salary_type'] === 'daily')
            ? round((float) $effective['daily_pay'] * $attendanceDays, 2)
            : round((float) $effective['base_salary'], 2);

        return AttendancePayrollSummary::query()->updateOrCreate(
            [
                'company_id' => $companyId,
                'user_id' => (int) $agent->id,
                'cycle_type' => (string) $period['cycle_type'],
                'period_start' => $period['period_start']->toDateString(),
                'period_end' => $period['period_end']->toDateString(),
            ],
            [
                'payroll_setting_id' => (int) $payrollSetting->id,
                'period_year' => (int) $period['period_year'],
                'period_month' => (int) $period['period_month'],
                'attendance_days' => $attendanceDays,
                'scheduled_work_days' => (int) $effective['work_days'],
                'daily_rate' => (float) $effective['daily_pay'],
                'salary_payable' => $salaryPayable,
                'currency' => (string) $effective['currency'],
                'generated_at' => now(),
                'metadata' => [
                    'attendance_affects_pay' => (bool) $effective['attendance_affects_pay'],
                    'actual_attendance_days' => $attendanceDays,
                    'actor_user_id' => $actorUserId,
                    'salary_type' => (string) $effective['salary_type'],
                    'base_salary' => round((float) $effective['base_salary'], 2),
                ],
            ],
        );
    }

    private function buildAgentRows(
        Collection $agents,
        int $companyId,
        ?PayrollSetting $payrollSetting,
        ?AttendanceSetting $attendanceSetting,
        Carbon $date,
        ?int $actorUserId,
    ): Collection {
        return $agents->map(function (User $agent) use ($companyId, $payrollSetting, $attendanceSetting, $date, $actorUserId): array {
            $period = $this->resolvePayrollPeriod($date, $this->resolveAgentSalaryType($agent, $payrollSetting));
            $summary = $this->ensurePayrollSummaryForPeriod(
                companyId: $companyId,
                agent: $agent,
                payrollSetting: $payrollSetting,
                attendanceSetting: $attendanceSetting,
                period: $period,
                actorUserId: $actorUserId,
            );

            return [
                'id' => (int) $agent->id,
                'name' => (string) $agent->name,
                'email' => (string) $agent->email,
                'avatar_url' => AvatarUrlResolver::resolve($agent->avatar, $agent->gender) ?? '/avatars/male-avatar.png',
                'assigned_zone' => $agent->assigned_zone,
                'role' => 'Agent',
                'status' => ucfirst((string) $summary->status),
                'base_salary' => round((float) ($summary->metadata['base_salary'] ?? $summary->salary_payable), 2),
                'daily_pay' => round((float) $summary->daily_rate, 2),
                'net_pay' => round((float) $summary->salary_payable, 2),
                'attendance_days' => (int) $summary->attendance_days,
                'currency' => (string) $summary->currency,
                'salary_type' => (string) ($summary->metadata['salary_type'] ?? $period['cycle_type']),
                'attendance_affects_pay' => (bool) ($summary->metadata['attendance_affects_pay'] ?? false),
                'created_date' => $summary->generated_at?->toDateString() ?? $summary->created_at?->toDateString(),
            ];
        })->values();
    }

    private function formatPeriodLabel(string $cycleType, Carbon $periodStart, Carbon $periodEnd): string
    {
        return $cycleType === 'weekly'
            ? sprintf('%s - %s', $periodStart->format('M j, Y'), $periodEnd->format('M j, Y'))
            : $periodStart->format('F Y');
    }

    private function formatMoney(float $amount, string $currency): string
    {
        $formatted = number_format($amount, 2);

        return match (strtoupper($currency)) {
            'NGN' => '₦' . $formatted,
            'USD' => '$' . $formatted,
            default => $formatted . ' ' . strtoupper($currency),
        };
    }

    private function streamCsvExport(int $companyId, User $actor, array $filters): void
    {
        $out = fopen('php://output', 'wb');
        if (! is_resource($out)) {
            return;
        }

        fwrite($out, "\xEF\xBB\xBF");
        fputcsv($out, self::EXPORT_HEADERS);

        $this->streamExportRows($companyId, $actor, $filters, function (array $row) use ($out): void {
            fputcsv($out, [
                $row['employee_name'],
                $row['role'],
                $row['salary_type'],
                $row['currency'],
                $row['base_salary'],
                $row['daily_pay'],
                $row['attendance_count'],
                $row['accumulated_pay'],
                $row['attendance_affect_pay'],
                $row['payroll_status'],
                $row['created_date'],
                $row['project_count'],
                $row['completed_tasks'],
                $row['pending_tasks'],
            ]);
        });

        fclose($out);
    }

    private function streamXlsxExport(int $companyId, User $actor, array $filters): void
    {
        $tmpFile = tempnam(sys_get_temp_dir(), 'payroll-export-');
        if ($tmpFile === false) {
            throw ValidationException::withMessages([
                'export' => ['Unable to prepare export file. Please try again.'],
            ]);
        }

        $writer = new XlsxWriter();
        $writer->openToFile($tmpFile);
        $writer->setCreator('Factory23 Payroll');

        $sheet = $writer->getCurrentSheet();
        $sheet->setName('Payroll Export');
        $sheet->setColumnWidth(26, 1);
        $sheet->setColumnWidth(14, 2, 4);
        $sheet->setColumnWidth(16, 5, 8);
        $sheet->setColumnWidth(22, 9, 11);
        $sheet->setColumnWidth(14, 12, 14);

        $headerStyle = (new Style())->setFontBold();
        $columnStyles = [];
        foreach (array_keys(self::EXPORT_HEADERS) as $index) {
            $columnStyles[$index] = $headerStyle;
        }

        $writer->addRow(Row::fromValuesWithStyles(self::EXPORT_HEADERS, null, $columnStyles));

        $this->streamExportRows($companyId, $actor, $filters, function (array $row) use ($writer): void {
            $writer->addRow(Row::fromValues([
                $row['employee_name'],
                $row['role'],
                $row['salary_type'],
                $row['currency'],
                $row['base_salary'],
                $row['daily_pay'],
                $row['attendance_count'],
                $row['accumulated_pay'],
                $row['attendance_affect_pay'],
                $row['payroll_status'],
                $row['created_date'],
                $row['project_count'],
                $row['completed_tasks'],
                $row['pending_tasks'],
            ]));
        });

        $writer->close();

        $reader = fopen($tmpFile, 'rb');
        if (is_resource($reader)) {
            fpassthru($reader);
            fclose($reader);
        }

        @unlink($tmpFile);
    }

    private function streamExportRows(int $companyId, User $actor, array $filters, callable $emit): void
    {
        $date = $this->resolveReferenceDate($filters);
        $payrollSetting = PayrollSetting::query()->where('company_id', $companyId)->first();
        $attendanceSetting = AttendanceSetting::query()->where('company_id', $companyId)->first();

        $query = $this->agentsQuery($companyId);

        if (! empty($filters['search'])) {
            $search = '%' . trim((string) $filters['search']) . '%';
            $query->where(function ($sub) use ($search): void {
                $sub->where('users.name', 'like', $search)
                    ->orWhere('users.email', 'like', $search)
                    ->orWhere('users.assigned_zone', 'like', $search);
            });
        }

        if (! empty($filters['role']) && strtolower((string) $filters['role']) !== 'agent') {
            return;
        }

        $query->orderBy('users.id')->chunkById(250, function (Collection $agents) use ($companyId, $payrollSetting, $attendanceSetting, $date, $actor, $filters, $emit): void {
            $rows = $this->buildAgentRows(
                agents: $agents,
                companyId: $companyId,
                payrollSetting: $payrollSetting,
                attendanceSetting: $attendanceSetting,
                date: $date,
                actorUserId: (int) $actor->id,
            );

            $taskStats = $this->buildTaskStatsForAgents($companyId, $agents->pluck('id')->map(static fn(mixed $id): int => (int) $id)->all());

            foreach ($rows as $row) {
                if (! $this->passesExportFilters($row, $filters)) {
                    continue;
                }

                $agentTaskStats = $taskStats[(int) $row['id']] ?? [
                    'project_count' => null,
                    'completed_tasks' => null,
                    'pending_tasks' => null,
                ];

                $emit([
                    'employee_name' => (string) ($row['name'] ?? ''),
                    'role' => (string) ($row['role'] ?? 'Agent'),
                    'salary_type' => strtoupper((string) ($row['salary_type'] ?? 'monthly')),
                    'currency' => strtoupper((string) ($row['currency'] ?? 'NGN')),
                    'base_salary' => round((float) ($row['base_salary'] ?? 0), 2),
                    'daily_pay' => round((float) ($row['daily_pay'] ?? 0), 2),
                    'attendance_count' => (int) ($row['attendance_days'] ?? 0),
                    'accumulated_pay' => round((float) ($row['net_pay'] ?? 0), 2),
                    'attendance_affect_pay' => (bool) ($row['attendance_affects_pay'] ?? false) ? 'Yes' : 'No',
                    'payroll_status' => (string) ($row['status'] ?? 'Pending'),
                    'created_date' => (string) ($row['created_date'] ?? $date->toDateString()),
                    'project_count' => $agentTaskStats['project_count'] ?? null,
                    'completed_tasks' => $agentTaskStats['completed_tasks'] ?? null,
                    'pending_tasks' => $agentTaskStats['pending_tasks'] ?? null,
                ]);
            }
        }, 'users.id');
    }

    private function passesExportFilters(array $row, array $filters): bool
    {
        if (! empty($filters['status']) && strtolower((string) $row['status']) !== strtolower((string) $filters['status'])) {
            return false;
        }

        if (! empty($filters['salary_type']) && strtolower((string) $row['salary_type']) !== strtolower((string) $filters['salary_type'])) {
            return false;
        }

        if (array_key_exists('attendance_affects_pay', $filters) && $filters['attendance_affects_pay'] !== null) {
            if ((bool) $row['attendance_affects_pay'] !== (bool) $filters['attendance_affects_pay']) {
                return false;
            }
        }

        $attendanceCount = (int) ($row['attendance_days'] ?? 0);
        if (array_key_exists('attendance_min', $filters) && $filters['attendance_min'] !== null && $attendanceCount < (int) $filters['attendance_min']) {
            return false;
        }

        if (array_key_exists('attendance_max', $filters) && $filters['attendance_max'] !== null && $attendanceCount > (int) $filters['attendance_max']) {
            return false;
        }

        return true;
    }

    private function buildTaskStatsForAgents(int $companyId, array $agentIds): array
    {
        if ($agentIds === []) {
            return [];
        }

        $stats = Task::query()
            ->selectRaw('assigned_agent_id as agent_id')
            ->selectRaw('COUNT(DISTINCT project_id) as project_count')
            ->selectRaw("SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_tasks")
            ->selectRaw("SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_tasks")
            ->where('company_id', $companyId)
            ->whereIn('assigned_agent_id', $agentIds)
            ->groupBy('assigned_agent_id')
            ->get();

        $result = [];
        foreach ($stats as $row) {
            $agentId = (int) ($row->agent_id ?? 0);
            if ($agentId < 1) {
                continue;
            }

            $result[$agentId] = [
                'project_count' => (int) ($row->project_count ?? 0),
                'completed_tasks' => (int) ($row->completed_tasks ?? 0),
                'pending_tasks' => (int) ($row->pending_tasks ?? 0),
            ];
        }

        return $result;
    }

    private function agentsQuery(int $companyId)
    {
        return User::query()
            ->select('users.*')
            ->join('company_users as cu', function ($join) use ($companyId): void {
                $join->on('cu.user_id', '=', 'users.id')
                    ->where('cu.company_id', '=', $companyId)
                    ->where('cu.role', '=', 'agent');
            })
            ->whereNull('users.deleted_at')
            ->orderBy('users.name');
    }

    private function resolveAgentInCompany(int $companyId, int $agentId): User
    {
        $agent = User::query()->find($agentId);

        if (! $agent) {
            throw ValidationException::withMessages([
                'user' => ['Agent not found.'],
            ]);
        }

        $isCompanyAgent = DB::table('company_users')
            ->where('company_id', $companyId)
            ->where('user_id', $agentId)
            ->where('role', 'agent')
            ->exists();

        if (! $isCompanyAgent) {
            throw ValidationException::withMessages([
                'user' => ['Selected user is not an agent in the active company context.'],
            ]);
        }

        return $agent;
    }

    private function calculateDailyPay(float $baseSalary, int $workDays, string $salaryType = 'monthly'): float
    {
        if ($salaryType === 'daily') {
            return round($baseSalary, 2);
        }

        return round($baseSalary / max($workDays, 1), 2);
    }

    private function assertSettingInCompany(PayrollSetting $payrollSetting, int $companyId): void
    {
        if ((int) $payrollSetting->company_id !== $companyId) {
            throw ValidationException::withMessages([
                'payroll' => ['Payroll settings do not belong to the active company context.'],
            ]);
        }
    }

    private function notifyPayrollChange(
        int $companyId,
        User $actor,
        string $type,
        string $title,
        string $message,
        string $priority,
    ): void {
        $recipientIds = DB::table('company_users')
            ->where('company_id', $companyId)
            ->whereIn('role', ['owner', 'admin', 'supervisor'])
            ->pluck('user_id')
            ->map(static fn(mixed $id): int => (int) $id)
            ->unique()
            ->reject(static fn(int $id): bool => $id === (int) $actor->id)
            ->values()
            ->all();

        foreach ($recipientIds as $recipientId) {
            $this->notificationService->notifyUser($recipientId, [
                'company_id' => $companyId,
                'type' => $type,
                'category' => NotificationCategory::PAYROLL->value,
                'title' => $title,
                'message' => $message,
                'reference_type' => PayrollSetting::class,
                'reference_id' => null,
                'action_url' => '/payroll',
                'action_route' => 'payroll.index',
                'priority' => $priority,
                'created_by_user_id' => (int) $actor->id,
                'metadata' => [
                    'company_id' => $companyId,
                    'actor_user_id' => (int) $actor->id,
                ],
                'dedupe_key' => $type . ':' . $companyId . ':' . $recipientId,
            ]);
        }
    }
}
