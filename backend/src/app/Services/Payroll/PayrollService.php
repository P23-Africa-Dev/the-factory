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
use App\Models\User;
use App\Services\Notification\NotificationService;
use App\Support\AvatarUrlResolver;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PayrollService
{
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

        $workDays = (int) $data['work_days'];
        $baseSalary = (float) $data['base_salary'];

        $setting = DB::transaction(function () use ($context, $data, $currency, $workDays, $baseSalary): PayrollSetting {
            return PayrollSetting::query()->create([
                'company_id' => $context->company->id,
                'salary_type' => $data['salary_type'],
                'base_salary' => $baseSalary,
                'currency' => $currency,
                'work_days' => $workDays,
                'work_hours' => (int) $data['work_hours'],
                'daily_pay' => $this->calculateDailyPay($baseSalary, $workDays),
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

        $payrollSetting->update([
            'salary_type' => $data['salary_type'] ?? $payrollSetting->salary_type?->value,
            'base_salary' => $baseSalary,
            'currency' => $currency,
            'work_days' => $workDays,
            'work_hours' => (int) ($data['work_hours'] ?? $payrollSetting->work_hours),
            'daily_pay' => $this->calculateDailyPay($baseSalary, $workDays),
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
        $date = ! empty($filters['date'])
            ? Carbon::parse((string) $filters['date'])->startOfDay()
            : now()->startOfDay();
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

            $effective = $this->resolveEffectivePayrollProfile(
                agent: $agent,
                payrollSetting: $payrollSetting,
                attendanceSetting: $attendanceSetting,
                periodStart: $date->copy()->startOfMonth(),
                periodEnd: $date->copy()->endOfMonth(),
            );

            $todayValue += (float) $effective['daily_pay'];
        }

        $yesterdayValue = 0.0;
        foreach ($yesterdayPresentIds as $agentId) {
            $agent = $agentsById->get($agentId);
            if (! $agent instanceof User) {
                continue;
            }

            $effective = $this->resolveEffectivePayrollProfile(
                agent: $agent,
                payrollSetting: $payrollSetting,
                attendanceSetting: $attendanceSetting,
                periodStart: $yesterday->copy()->startOfMonth(),
                periodEnd: $yesterday->copy()->endOfMonth(),
            );

            $yesterdayValue += (float) $effective['daily_pay'];
        }

        $totalPayroll = $agents->reduce(function (float $carry, User $agent) use ($payrollSetting, $attendanceSetting, $date): float {
            $effective = $this->resolveEffectivePayrollProfile(
                agent: $agent,
                payrollSetting: $payrollSetting,
                attendanceSetting: $attendanceSetting,
                periodStart: $date->copy()->startOfMonth(),
                periodEnd: $date->copy()->endOfMonth(),
            );

            return $carry + (float) $effective['base_salary'];
        }, 0.0);

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
            'pending_approval' => 0.0,
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
        $year = (int) ($filters['year'] ?? now()->year);
        $month = (int) ($filters['month'] ?? now()->month);
        $periodStart = Carbon::create($year, $month, 1)->startOfMonth();
        $periodEnd = $periodStart->copy()->endOfMonth();

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

        if (! empty($filters['status'])) {
            $status = strtolower((string) $filters['status']);

            if ($status === 'approved') {
                $query->where(function ($sub): void {
                    $sub->where('users.onboarding_status', 'active')
                        ->orWhere('users.is_active', true);
                });
            }

            if ($status === 'pending') {
                $query->where(function ($sub): void {
                    $sub->where('users.onboarding_status', '!=', 'active')
                        ->orWhereNull('users.onboarding_status')
                        ->orWhere('users.is_active', false);
                });
            }
        }

        $perPage = (int) ($filters['per_page'] ?? 20);
        $paginated = $query->paginate($perPage)->withQueryString();

        $items = collect($paginated->items());
        $agentIds = $items->pluck('id')->map(static fn(mixed $id): int => (int) $id)->all();

        $attendanceCounts = AttendanceRecord::query()
            ->selectRaw('user_id, COUNT(*) as total')
            ->where('company_id', $companyId)
            ->whereIn('user_id', $agentIds)
            ->whereBetween('attendance_date', [$periodStart->toDateString(), $periodEnd->toDateString()])
            ->whereIn('status', self::PRESENT_STATUSES)
            ->groupBy('user_id')
            ->pluck('total', 'user_id');

        $payrollSetting = PayrollSetting::query()->where('company_id', $companyId)->first();
        $attendanceSetting = AttendanceSetting::query()->where('company_id', $companyId)->first();

        $rows = $items->map(function (User $agent) use ($attendanceCounts, $payrollSetting, $attendanceSetting, $periodStart, $periodEnd): array {
            $effective = $this->resolveEffectivePayrollProfile(
                agent: $agent,
                payrollSetting: $payrollSetting,
                attendanceSetting: $attendanceSetting,
                periodStart: $periodStart,
                periodEnd: $periodEnd,
            );

            $attendanceDays = (int) ($attendanceCounts->get((int) $agent->id) ?? 0);

            $netPay = $effective['attendance_affects_pay']
                ? round((float) $effective['daily_pay'] * $attendanceDays, 2)
                : round((float) $effective['base_salary'], 2);

            $status = (($agent->onboarding_status === 'active') || ((bool) $agent->is_active === true))
                ? 'Approved'
                : 'Pending';

            return [
                'id' => (int) $agent->id,
                'name' => (string) $agent->name,
                'email' => (string) $agent->email,
                'avatar_url' => AvatarUrlResolver::resolve($agent->avatar, $agent->gender) ?? '/avatars/male-avatar.png',
                'assigned_zone' => $agent->assigned_zone,
                'role' => 'Agent',
                'status' => $status,
                'base_salary' => round((float) $effective['base_salary'], 2),
                'daily_pay' => round((float) $effective['daily_pay'], 2),
                'net_pay' => $netPay,
                'attendance_days' => $attendanceDays,
                'currency' => (string) $effective['currency'],
                'salary_type' => (string) $effective['salary_type'],
                'attendance_affects_pay' => (bool) $effective['attendance_affects_pay'],
            ];
        })->values()->all();

        return [
            'items' => $rows,
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
        $year = (int) ($filters['year'] ?? now()->year);
        $month = (int) ($filters['month'] ?? now()->month);

        return $this->buildAgentProfilePayload(
            companyId: (int) $context->company->id,
            agent: $agent,
            year: $year,
            month: $month,
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
            $updates['salary_currency'] = strtoupper((string) ($agent->salary_currency ?: $payrollSetting?->currency ?: $context->company->currency_code ?: 'NGN'));
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
            year: (int) now()->year,
            month: (int) now()->month,
        );
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

    private function buildAgentProfilePayload(int $companyId, User $agent, int $year, int $month): array
    {
        $periodStart = Carbon::create($year, $month, 1)->startOfMonth();
        $periodEnd = $periodStart->copy()->endOfMonth();

        $payrollSetting = PayrollSetting::query()->where('company_id', $companyId)->first();
        $attendanceSetting = AttendanceSetting::query()->where('company_id', $companyId)->first();

        $effective = $this->resolveEffectivePayrollProfile(
            agent: $agent,
            payrollSetting: $payrollSetting,
            attendanceSetting: $attendanceSetting,
            periodStart: $periodStart,
            periodEnd: $periodEnd,
        );

        $attendanceDays = AttendanceRecord::query()
            ->where('company_id', $companyId)
            ->where('user_id', $agent->id)
            ->whereBetween('attendance_date', [$periodStart->toDateString(), $periodEnd->toDateString()])
            ->whereIn('status', self::PRESENT_STATUSES)
            ->count();

        $salaryPayable = $effective['attendance_affects_pay']
            ? round((float) $effective['daily_pay'] * $attendanceDays, 2)
            : round((float) $effective['base_salary'], 2);

        $history = AttendancePayrollSummary::query()
            ->where('company_id', $companyId)
            ->where('user_id', $agent->id)
            ->orderByDesc('period_year')
            ->orderByDesc('period_month')
            ->limit(6)
            ->get()
            ->map(static function (AttendancePayrollSummary $summary): array {
                $monthDate = Carbon::create((int) $summary->period_year, (int) $summary->period_month, 1);

                return [
                    'id' => (int) $summary->id,
                    'month' => $monthDate->format('F'),
                    'period_year' => (int) $summary->period_year,
                    'period_month' => (int) $summary->period_month,
                    'base_salary' => round((float) $summary->daily_rate * (int) $summary->scheduled_work_days, 2),
                    'net_pay' => round((float) $summary->salary_payable, 2),
                    'due_date' => $summary->period_end?->toDateString(),
                    'status' => 'Approved',
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
            'salary_type' => (string) $effective['salary_type'],
            'base_salary' => round((float) $effective['base_salary'], 2),
            'daily_pay' => round((float) $effective['daily_pay'], 2),
            'work_days' => (int) $effective['work_days'],
            'work_hours' => (float) $effective['work_hours'],
            'attendance_affects_pay' => (bool) $effective['attendance_affects_pay'],
            'commission_enabled' => (bool) $effective['commission_enabled'],
            'currency' => (string) $effective['currency'],
            'attendance_days' => $attendanceDays,
            'salary_payable' => $salaryPayable,
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

        $dailyPay = $workDays > 0 ? round($baseSalary / $workDays, 2) : 0.0;

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

    private function calculateDailyPay(float $baseSalary, int $workDays): float
    {
        return round($baseSalary / $workDays, 2);
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
