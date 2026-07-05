<?php

declare(strict_types=1);

namespace App\Services\Attendance;

use App\Enums\AttendanceStatus;
use App\Enums\NotificationCategory;
use App\Enums\NotificationPriority;
use App\Models\AttendanceRecord;
use App\Models\AttendanceSetting;
use App\Models\PayrollSetting;
use App\Models\User;
use App\Support\AvatarUrlResolver;
use App\Services\Notification\NotificationService;
use Carbon\Carbon;
use Illuminate\Contracts\Pagination\Paginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class AttendanceService
{
    private const DEFAULT_WORKING_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

    public function __construct(
        private readonly AttendanceAccessService $attendanceAccessService,
        private readonly NotificationService $notificationService,
    ) {}

    public function clockIn(User $user, array $data): AttendanceRecord
    {
        $context = $this->attendanceAccessService->resolve($user, $data['company_id'] ?? null);
        $this->attendanceAccessService->ensureAgent($context);

        $setting = $this->requireSetting((int) $context->company->id);
        $clockInAt = isset($data['recorded_at']) ? Carbon::parse((string) $data['recorded_at']) : now();

        $this->ensureWorkingDay($clockInAt, $setting);

        [$windowStart, $openingTime, $closingTime] = $this->scheduleBoundsForDate($clockInAt, $setting);

        if ($clockInAt->lt($windowStart)) {
            $this->notifyAttendanceIssue($user, (int) $context->company->id, 'clock_in_before_window', 'Clock-in is not open yet.');

            throw ValidationException::withMessages([
                'clock_in' => ['Clock-in is not active yet for today.'],
            ]);
        }

        if ($clockInAt->gt($closingTime)) {
            $this->notifyAttendanceIssue($user, (int) $context->company->id, 'clock_in_after_close', 'Clock-in is closed for the day.');

            throw ValidationException::withMessages([
                'clock_in' => ['Attendance actions are closed for today.'],
            ]);
        }

        $attendanceDate = $clockInAt->toDateString();

        $existing = AttendanceRecord::query()
            ->where('company_id', $context->company->id)
            ->where('user_id', $user->id)
            ->whereDate('attendance_date', $attendanceDate)
            ->first();

        if ($existing && $existing->clock_in_at !== null) {
            throw ValidationException::withMessages([
                'clock_in' => ['You have already clocked in for today.'],
            ]);
        }

        $status = $clockInAt->gt($openingTime)
            ? AttendanceStatus::LATE->value
            : AttendanceStatus::PRESENT->value;

        $record = AttendanceRecord::query()->updateOrCreate(
            [
                'company_id' => (int) $context->company->id,
                'user_id' => (int) $user->id,
                'attendance_date' => $attendanceDate,
            ],
            [
                'clock_in_at' => $clockInAt,
                'status' => $status,
                'is_late' => $status === AttendanceStatus::LATE->value,
                'metadata' => [
                    'clock_in_latitude' => $data['latitude'] ?? null,
                    'clock_in_longitude' => $data['longitude'] ?? null,
                ],
            ],
        );

        $this->notificationService->notifyUser((int) $user->id, [
            'company_id' => (int) $context->company->id,
            'type' => 'attendance.clock_in_success',
            'category' => NotificationCategory::ATTENDANCE->value,
            'title' => 'Clock-in successful',
            'message' => 'Your attendance clock-in was recorded successfully.',
            'reference_type' => AttendanceRecord::class,
            'reference_id' => (int) $record->id,
            'action_url' => '/agent/operations/attendance',
            'action_route' => 'attendance.me.today',
            'priority' => NotificationPriority::NORMAL->value,
            'created_by_user_id' => (int) $user->id,
            'metadata' => [
                'attendance_date' => $attendanceDate,
                'clock_in_at' => $clockInAt->toIso8601String(),
            ],
            'dedupe_key' => 'attendance-clock-in:' . (int) $context->company->id . ':' . (int) $user->id . ':' . $attendanceDate,
        ]);

        return $record->fresh();
    }

    public function clockOut(User $user, array $data): AttendanceRecord
    {
        $context = $this->attendanceAccessService->resolve($user, $data['company_id'] ?? null);
        $this->attendanceAccessService->ensureAgent($context);

        $setting = $this->requireSetting((int) $context->company->id);
        $clockOutAt = isset($data['recorded_at']) ? Carbon::parse((string) $data['recorded_at']) : now();

        $attendanceDate = $clockOutAt->toDateString();

        $record = AttendanceRecord::query()
            ->where('company_id', $context->company->id)
            ->where('user_id', $user->id)
            ->whereDate('attendance_date', $attendanceDate)
            ->first();

        if (! $record || $record->clock_in_at === null) {
            $this->notifyAttendanceIssue($user, (int) $context->company->id, 'clock_out_without_clock_in', 'Clock-out requires clock-in first.');

            throw ValidationException::withMessages([
                'clock_out' => ['You must clock in before you can clock out.'],
            ]);
        }

        if ($record->clock_out_at !== null) {
            throw ValidationException::withMessages([
                'clock_out' => ['You have already clocked out for today.'],
            ]);
        }

        [,, $closingTime] = $this->scheduleBoundsForDate($clockOutAt, $setting);

        if ($clockOutAt->gt($closingTime)) {
            $this->notifyAttendanceIssue($user, (int) $context->company->id, 'clock_out_after_close', 'Clock-out is closed for the day.');

            throw ValidationException::withMessages([
                'clock_out' => ['Attendance actions are closed for today.'],
            ]);
        }

        $workDurationMinutes = max(0, $record->clock_in_at->diffInMinutes($clockOutAt));

        $metadata = $record->metadata ?? [];
        $metadata['clock_out_latitude'] = $data['latitude'] ?? null;
        $metadata['clock_out_longitude'] = $data['longitude'] ?? null;

        $record->update([
            'clock_out_at' => $clockOutAt,
            'work_duration_minutes' => $workDurationMinutes,
            'metadata' => $metadata,
        ]);

        $this->notificationService->notifyUser((int) $user->id, [
            'company_id' => (int) $context->company->id,
            'type' => 'attendance.clock_out_success',
            'category' => NotificationCategory::ATTENDANCE->value,
            'title' => 'Clock-out successful',
            'message' => 'Your attendance clock-out was recorded successfully.',
            'reference_type' => AttendanceRecord::class,
            'reference_id' => (int) $record->id,
            'action_url' => '/agent/operations/attendance',
            'action_route' => 'attendance.me.today',
            'priority' => NotificationPriority::NORMAL->value,
            'created_by_user_id' => (int) $user->id,
            'metadata' => [
                'attendance_date' => $attendanceDate,
                'clock_out_at' => $clockOutAt->toIso8601String(),
                'work_duration_minutes' => $workDurationMinutes,
            ],
            'dedupe_key' => 'attendance-clock-out:' . (int) $context->company->id . ':' . (int) $user->id . ':' . $attendanceDate,
        ]);

        return $record->fresh();
    }

    public function todayForAgent(User $user, ?int $companyId = null): array
    {
        $context = $this->attendanceAccessService->resolve($user, $companyId);
        $this->attendanceAccessService->ensureAgent($context);

        $now = now();
        $setting = $this->requireSetting((int) $context->company->id);
        [$windowStart, $openingTime, $closingTime] = $this->scheduleBoundsForDate($now, $setting);

        $attendanceDate = $now->toDateString();

        $record = AttendanceRecord::query()
            ->where('company_id', $context->company->id)
            ->where('user_id', $user->id)
            ->whereDate('attendance_date', $attendanceDate)
            ->first();

        $workingDay = $this->isWorkingDay($now, $setting);
        $windowActive = $workingDay && $now->betweenIncluded($windowStart, $closingTime);

        return [
            'company_id' => (int) $context->company->id,
            'attendance_date' => $attendanceDate,
            'working_day' => $workingDay,
            'window_start_at' => $windowStart->toIso8601String(),
            'opening_at' => $openingTime->toIso8601String(),
            'closing_at' => $closingTime->toIso8601String(),
            'window_active' => $windowActive,
            'actions_locked_until_next_workday' => $now->gt($closingTime),
            'can_clock_in' => $record === null && $windowActive,
            'can_clock_out' => $record !== null && $record->clock_out_at === null && $now->lte($closingTime),
            'record' => $record,
            'status' => $record?->status?->value ?? ($workingDay && $now->gt($closingTime) ? 'absent' : 'not_started'),
        ];
    }

    public function historyForAgent(User $user, array $filters): Paginator
    {
        $context = $this->attendanceAccessService->resolve($user, $filters['company_id'] ?? null);
        $this->attendanceAccessService->ensureAgent($context);

        $query = AttendanceRecord::query()
            ->where('company_id', $context->company->id)
            ->where('user_id', $user->id)
            ->latest('attendance_date');

        if (! empty($filters['from_date'])) {
            $query->whereDate('attendance_date', '>=', (string) $filters['from_date']);
        }

        if (! empty($filters['to_date'])) {
            $query->whereDate('attendance_date', '<=', (string) $filters['to_date']);
        }

        if (! empty($filters['status'])) {
            $query->where('status', (string) $filters['status']);
        }

        return $query->simplePaginate((int) ($filters['per_page'] ?? 20))->withQueryString();
    }

    public function historyForManagedAgent(User $user, User $agent, array $filters): array
    {
        $context = $this->attendanceAccessService->resolve($user, $filters['company_id'] ?? null);
        $this->attendanceAccessService->ensureCanManage($context);

        $companyId = (int) $context->company->id;

        $belongsToCompany = DB::table('company_users')
            ->where('company_id', $companyId)
            ->where('user_id', $agent->id)
            ->exists();

        if (! $belongsToCompany) {
            throw ValidationException::withMessages([
                'user_id' => ['The selected agent does not belong to this company.'],
            ]);
        }

        $today = now()->startOfDay();

        $toDate = ! empty($filters['to_date'])
            ? Carbon::parse((string) $filters['to_date'])->startOfDay()
            : $today->copy();

        $fromDate = ! empty($filters['from_date'])
            ? Carbon::parse((string) $filters['from_date'])->startOfDay()
            : $toDate->copy()->subDays(29);

        if ($fromDate->gt($toDate)) {
            [$fromDate, $toDate] = [$toDate, $fromDate];
        }

        $setting = AttendanceSetting::query()->where('company_id', $companyId)->first();
        $workingDays = collect($setting?->working_days ?? self::DEFAULT_WORKING_DAYS)
            ->map(static fn(mixed $day): string => strtolower((string) $day))
            ->all();

        $records = AttendanceRecord::query()
            ->where('company_id', $companyId)
            ->where('user_id', $agent->id)
            ->whereBetween('attendance_date', [$fromDate->toDateString(), $toDate->toDateString()])
            ->get()
            ->keyBy(static fn(AttendanceRecord $record): string => $record->attendance_date->toDateString());

        // Build a descending day-by-day series. Concluded scheduled working days
        // without a record are synthesized as "absent" so the timeline and summary
        // reflect the full range rather than only days with a stored record.
        $rangeEnd = $today->lt($toDate) ? $today->copy() : $toDate->copy();
        $items = collect();

        for ($day = $rangeEnd->copy(); $day->gte($fromDate); $day->subDay()) {
            $dateString = $day->toDateString();
            $record = $records->get($dateString);

            if ($record !== null) {
                $items->push($this->formatHistoryRecord($record));

                continue;
            }

            $isWorkingDay = in_array(strtolower($day->englishDayOfWeek), $workingDays, true);

            if ($isWorkingDay && $day->lt($today)) {
                $items->push($this->formatAbsentDay($companyId, (int) $agent->id, $dateString));
            }
        }

        $presentDays = $items->filter(static fn(array $item): bool => $item['clock_in_at'] !== null && $item['is_late'] === false)->count();
        $lateDays = $items->filter(static fn(array $item): bool => $item['is_late'] === true)->count();
        $absentDays = $items->filter(static fn(array $item): bool => $item['status'] === 'absent')->count();
        $totalDays = $items->count();
        $attendanceRate = $totalDays > 0
            ? (int) round((($presentDays + $lateDays) / $totalDays) * 100)
            : 0;

        $statusFilter = ! empty($filters['status']) ? (string) $filters['status'] : null;

        $filtered = $statusFilter !== null
            ? $items->filter(static function (array $item) use ($statusFilter): bool {
                return match ($statusFilter) {
                    'present' => $item['clock_in_at'] !== null && $item['is_late'] === false,
                    'late' => $item['is_late'] === true,
                    'absent' => $item['status'] === 'absent',
                    'auto_clocked_out' => $item['is_auto_clocked_out'] === true,
                    default => true,
                };
            })->values()
            : $items->values();

        $perPage = (int) ($filters['per_page'] ?? 30);
        $page = max(1, (int) ($filters['page'] ?? 1));
        $total = $filtered->count();
        $lastPage = max(1, (int) ceil($total / $perPage));
        $pageItems = $filtered->forPage($page, $perPage)->values();

        return [
            'user_id' => (int) $agent->id,
            'agent_name' => (string) $agent->name,
            'avatar_url' => AvatarUrlResolver::resolveOrDefault($agent->avatar, $agent->gender ?? null),
            'summary' => [
                'present_days' => $presentDays,
                'late_days' => $lateDays,
                'absent_days' => $absentDays,
                'total_days' => $totalDays,
                'attendance_rate_percent' => $attendanceRate,
            ],
            'items' => $pageItems->all(),
            'pagination' => [
                'total' => $total,
                'per_page' => $perPage,
                'current_page' => $page,
                'last_page' => $lastPage,
                'next_page_url' => $page < $lastPage
                    ? request()->fullUrlWithQuery(['page' => $page + 1])
                    : null,
                'prev_page_url' => $page > 1
                    ? request()->fullUrlWithQuery(['page' => $page - 1])
                    : null,
            ],
        ];
    }

    private function formatHistoryRecord(AttendanceRecord $record): array
    {
        return [
            'id' => (int) $record->id,
            'company_id' => (int) $record->company_id,
            'user_id' => (int) $record->user_id,
            'attendance_date' => $record->attendance_date?->toDateString(),
            'clock_in_at' => $record->clock_in_at?->toIso8601String(),
            'clock_out_at' => $record->clock_out_at?->toIso8601String(),
            'status' => $record->status?->value,
            'work_duration_minutes' => $record->work_duration_minutes !== null ? (int) $record->work_duration_minutes : null,
            'work_duration_hours' => $record->work_duration_minutes !== null
                ? round(((int) $record->work_duration_minutes) / 60, 2)
                : null,
            'is_late' => (bool) $record->is_late,
            'is_auto_clocked_out' => (bool) $record->is_auto_clocked_out,
            'metadata' => $record->metadata,
            'created_at' => $record->created_at?->toIso8601String(),
            'updated_at' => $record->updated_at?->toIso8601String(),
        ];
    }

    private function formatAbsentDay(int $companyId, int $userId, string $dateString): array
    {
        return [
            'id' => 'absent-' . $dateString,
            'company_id' => $companyId,
            'user_id' => $userId,
            'attendance_date' => $dateString,
            'clock_in_at' => null,
            'clock_out_at' => null,
            'status' => 'absent',
            'work_duration_minutes' => null,
            'work_duration_hours' => null,
            'is_late' => false,
            'is_auto_clocked_out' => false,
            'metadata' => null,
            'created_at' => null,
            'updated_at' => null,
        ];
    }

    public function statsForAgent(User $user, array $filters): array
    {
        $context = $this->attendanceAccessService->resolve($user, $filters['company_id'] ?? null);
        $this->attendanceAccessService->ensureAgent($context);

        $year = (int) $filters['year'];
        $month = (int) $filters['month'];

        $periodStart = Carbon::create($year, $month, 1)->startOfMonth();
        $periodEnd = $periodStart->copy()->endOfMonth();

        $setting = $this->requireSetting((int) $context->company->id);

        $records = AttendanceRecord::query()
            ->where('company_id', $context->company->id)
            ->where('user_id', $user->id)
            ->whereBetween('attendance_date', [$periodStart->toDateString(), $periodEnd->toDateString()])
            ->get();

        $requiredMinutes = $this->requiredWorkMinutes((int) $context->company->id, $setting);

        $presentDays = $records
            ->filter(fn(AttendanceRecord $record): bool => in_array($record->status?->value, [
                AttendanceStatus::PRESENT->value,
                AttendanceStatus::LATE->value,
                AttendanceStatus::AUTO_CLOCKED_OUT->value,
            ], true))
            ->count();

        $lateDays = $records->where('status', AttendanceStatus::LATE)->count();
        $autoClockedDays = $records->where('status', AttendanceStatus::AUTO_CLOCKED_OUT)->count();

        $undertimeDays = $records
            ->filter(static fn(AttendanceRecord $record): bool => $record->clock_out_at !== null
                && $record->work_duration_minutes !== null
                && $record->work_duration_minutes < $requiredMinutes)
            ->count();

        $scheduledDays = $this->countScheduledWorkingDays(
            $periodStart,
            $periodEnd,
            $setting->working_days ?? self::DEFAULT_WORKING_DAYS,
        );

        return [
            'period_year' => $year,
            'period_month' => $month,
            'scheduled_working_days' => $scheduledDays,
            'present_days' => $presentDays,
            'absent_days' => max(0, $scheduledDays - $presentDays),
            'late_days' => $lateDays,
            'auto_clocked_days' => $autoClockedDays,
            'undertime_days' => $undertimeDays,
            'attendance_percentage' => $scheduledDays > 0
                ? round(($presentDays / $scheduledDays) * 100, 2)
                : 0.0,
        ];
    }

    public function metricsForManagement(User $user, array $filters): array
    {
        $context = $this->attendanceAccessService->resolve($user, $filters['company_id'] ?? null);
        $this->attendanceAccessService->ensureCanManage($context);

        $date = ! empty($filters['date'])
            ? Carbon::parse((string) $filters['date'])->toDateString()
            : now()->toDateString();

        $totalWorkforce = DB::table('company_users')
            ->where('company_id', $context->company->id)
            ->where('role', 'agent')
            ->count();

        $records = AttendanceRecord::query()
            ->where('company_id', $context->company->id)
            ->whereDate('attendance_date', $date);

        $present = (clone $records)
            ->whereIn('status', [
                AttendanceStatus::PRESENT->value,
                AttendanceStatus::LATE->value,
                AttendanceStatus::AUTO_CLOCKED_OUT->value,
            ])
            ->count();

        $late = (clone $records)->where('status', AttendanceStatus::LATE->value)->count();
        $autoClocked = (clone $records)->where('status', AttendanceStatus::AUTO_CLOCKED_OUT->value)->count();
        $absent = max(0, (int) $totalWorkforce - (int) $present);

        return [
            'date' => $date,
            'total_workforce' => (int) $totalWorkforce,
            'present' => (int) $present,
            'absent' => (int) $absent,
            'late' => (int) $late,
            'auto_clocked' => (int) $autoClocked,
            'attendance_percentage' => $totalWorkforce > 0
                ? round(((int) $present / (int) $totalWorkforce) * 100, 2)
                : 0.0,
        ];
    }

    public function listForManagement(User $user, array $filters): array
    {
        $context = $this->attendanceAccessService->resolve($user, $filters['company_id'] ?? null);
        $this->attendanceAccessService->ensureCanManage($context);

        $date = ! empty($filters['date'])
            ? Carbon::parse((string) $filters['date'])->toDateString()
            : now()->toDateString();

        $fromDate = ! empty($filters['from_date'])
            ? Carbon::parse((string) $filters['from_date'])->toDateString()
            : null;
        $toDate = ! empty($filters['to_date'])
            ? Carbon::parse((string) $filters['to_date'])->toDateString()
            : null;

        $hasRangeFilter = $fromDate !== null || $toDate !== null;

        if ($hasRangeFilter) {
            $rangeFrom = $fromDate ?? $toDate;
            $rangeTo = $toDate ?? $fromDate;

            if ($rangeFrom !== null && $rangeTo !== null && strcmp($rangeFrom, $rangeTo) > 0) {
                [$rangeFrom, $rangeTo] = [$rangeTo, $rangeFrom];
            }

            $query = DB::table('attendance_records as ar')
                ->join('users as u', 'u.id', '=', 'ar.user_id')
                ->join('company_users as cu', function ($join): void {
                    $join->on('cu.user_id', '=', 'u.id')
                        ->on('cu.company_id', '=', 'ar.company_id');
                })
                ->where('ar.company_id', $context->company->id)
                ->where('cu.role', 'agent')
                ->whereDate('ar.attendance_date', '>=', (string) $rangeFrom)
                ->whereDate('ar.attendance_date', '<=', (string) $rangeTo)
                ->select([
                    'u.id as user_id',
                    'u.name as agent_name',
                    'u.avatar',
                    'u.assigned_zone',
                    'u.internal_role',
                    'ar.attendance_date',
                    'ar.id as attendance_record_id',
                    'ar.clock_in_at',
                    'ar.clock_out_at',
                    'ar.status',
                    'ar.work_duration_minutes',
                    'ar.is_late',
                    'ar.is_auto_clocked_out',
                ]);
        } else {
            $query = DB::table('company_users as cu')
                ->join('users as u', 'u.id', '=', 'cu.user_id')
                ->leftJoin('attendance_records as ar', function ($join) use ($date): void {
                    $join->on('ar.user_id', '=', 'u.id')
                        ->on('ar.company_id', '=', 'cu.company_id')
                        ->whereDate('ar.attendance_date', '=', $date);
                })
                ->where('cu.company_id', $context->company->id)
                ->where('cu.role', 'agent')
                ->select([
                    'u.id as user_id',
                    'u.name as agent_name',
                    'u.avatar',
                    'u.assigned_zone',
                    'u.internal_role',
                    'ar.attendance_date',
                    'ar.id as attendance_record_id',
                    'ar.clock_in_at',
                    'ar.clock_out_at',
                    'ar.status',
                    'ar.work_duration_minutes',
                    'ar.is_late',
                    'ar.is_auto_clocked_out',
                ]);
        }

        if (! empty($filters['search'])) {
            $search = '%' . trim((string) $filters['search']) . '%';
            $query->where(function ($sub) use ($search): void {
                $sub->where('u.name', 'like', $search)
                    ->orWhere('u.email', 'like', $search)
                    ->orWhere('u.internal_role', 'like', $search)
                    ->orWhere('u.assigned_zone', 'like', $search);
            });
        }

        if (! empty($filters['role'])) {
            $query->where('u.internal_role', (string) $filters['role']);
        }

        if (! empty($filters['status'])) {
            $status = (string) $filters['status'];

            if ($status === 'absent') {
                if ($hasRangeFilter) {
                    $query->where('ar.status', 'absent');
                } else {
                    $query->whereNull('ar.id');
                }
            } elseif ($status === 'present') {
                $query->whereIn('ar.status', [
                    AttendanceStatus::PRESENT->value,
                    AttendanceStatus::LATE->value,
                    AttendanceStatus::AUTO_CLOCKED_OUT->value,
                ]);
            } elseif ($status === 'clocked_out') {
                $query->whereNotNull('ar.clock_out_at');
            } else {
                $query->where('ar.status', $status);
            }
        }

        if (! empty($filters['clock_state'])) {
            $clockState = (string) $filters['clock_state'];

            if ($clockState === 'clocked_in') {
                $query->whereNotNull('ar.clock_in_at');
            }

            if ($clockState === 'clocked_out') {
                $query->whereNotNull('ar.clock_out_at');
            }
        }

        $paginated = $query
            ->orderByDesc('ar.attendance_date')
            ->orderBy('u.name')
            ->paginate((int) ($filters['per_page'] ?? 20))
            ->withQueryString();

        $items = collect($paginated->items())->map(static function (object $item) use ($date): array {
            $status = $item->status !== null ? (string) $item->status : 'absent';
            $avatarUrl = AvatarUrlResolver::resolveOrDefault($item->avatar, null);
            $attendanceDate = $item->attendance_date !== null
                ? Carbon::parse((string) $item->attendance_date)->toDateString()
                : $date;

            return [
                'user_id' => (int) $item->user_id,
                'agent_name' => (string) $item->agent_name,
                'avatar' => $item->avatar,
                'avatar_url' => $avatarUrl,
                'zone' => $item->assigned_zone,
                'role' => $item->internal_role,
                'attendance_date' => $attendanceDate,
                'clock_in_at' => $item->clock_in_at ? Carbon::parse((string) $item->clock_in_at)->toIso8601String() : null,
                'clock_out_at' => $item->clock_out_at ? Carbon::parse((string) $item->clock_out_at)->toIso8601String() : null,
                'status' => $status,
                'work_duration_minutes' => $item->work_duration_minutes !== null ? (int) $item->work_duration_minutes : null,
                'is_late' => (bool) ($item->is_late ?? false),
                'is_auto_clocked_out' => (bool) ($item->is_auto_clocked_out ?? false),
            ];
        })->values()->all();

        return [
            'date' => $date,
            'from_date' => $fromDate,
            'to_date' => $toDate,
            'items' => $items,
            'pagination' => [
                'next_page_url' => $paginated->nextPageUrl(),
                'prev_page_url' => $paginated->previousPageUrl(),
                'per_page' => $paginated->perPage(),
                'current_page' => $paginated->currentPage(),
                'last_page' => $paginated->lastPage(),
                'total' => $paginated->total(),
            ],
        ];
    }

    public function autoClockOutForOpenRecords(?int $companyId = null): array
    {
        $settings = AttendanceSetting::query()
            ->where('auto_clockout_enabled', true)
            ->when($companyId !== null, fn($query) => $query->where('company_id', $companyId))
            ->get();

        $autoClockedCount = 0;
        $closedNoticeCount = 0;
        $issueAlertCount = 0;

        foreach ($settings as $setting) {
            $openRecords = AttendanceRecord::query()
                ->where('company_id', $setting->company_id)
                ->whereNull('clock_out_at')
                ->whereNotNull('clock_in_at')
                ->whereDate('attendance_date', '<=', now()->toDateString())
                ->get();

            foreach ($openRecords as $record) {
                $attendanceDate = Carbon::parse((string) $record->attendance_date);
                [,, $closingTime] = $this->scheduleBoundsForDate($attendanceDate, $setting);

                if (now()->lt($closingTime)) {
                    continue;
                }

                $workDurationMinutes = max(0, $record->clock_in_at?->diffInMinutes($closingTime) ?? 0);

                $record->update([
                    'clock_out_at' => $closingTime,
                    'status' => AttendanceStatus::AUTO_CLOCKED_OUT->value,
                    'is_auto_clocked_out' => true,
                    'work_duration_minutes' => $workDurationMinutes,
                ]);

                $this->notificationService->notifyUser((int) $record->user_id, [
                    'company_id' => (int) $record->company_id,
                    'type' => 'attendance.auto_clock_out',
                    'category' => NotificationCategory::ATTENDANCE->value,
                    'title' => 'Auto clock-out applied',
                    'message' => 'You were automatically clocked out at company closing time.',
                    'reference_type' => AttendanceRecord::class,
                    'reference_id' => (int) $record->id,
                    'action_url' => '/agent/operations/attendance',
                    'action_route' => 'attendance.me.today',
                    'priority' => NotificationPriority::HIGH->value,
                    'created_by_user_id' => null,
                    'metadata' => [
                        'attendance_date' => $record->attendance_date?->toDateString(),
                        'clock_out_at' => $closingTime->toIso8601String(),
                    ],
                    'dedupe_key' => 'attendance-auto-clock-out:' . (int) $record->id,
                ]);

                $autoClockedCount++;
            }

            $today = now();
            if (! $this->isWorkingDay($today, $setting)) {
                continue;
            }

            [,, $todayClosing] = $this->scheduleBoundsForDate($today, $setting);
            if (now()->lt($todayClosing)) {
                continue;
            }

            $agentIds = DB::table('company_users')
                ->where('company_id', $setting->company_id)
                ->where('role', 'agent')
                ->pluck('user_id')
                ->map(static fn(mixed $id): int => (int) $id)
                ->all();

            $clockedInUserIds = AttendanceRecord::query()
                ->where('company_id', $setting->company_id)
                ->whereDate('attendance_date', $today->toDateString())
                ->whereNotNull('clock_in_at')
                ->pluck('user_id')
                ->map(static fn(mixed $id): int => (int) $id)
                ->all();

            foreach ($agentIds as $agentId) {
                $this->notificationService->notifyUser($agentId, [
                    'company_id' => (int) $setting->company_id,
                    'type' => 'attendance.closed',
                    'category' => NotificationCategory::ATTENDANCE->value,
                    'title' => 'Attendance closed',
                    'message' => 'Attendance actions for today are now closed.',
                    'action_url' => '/agent/operations/attendance',
                    'action_route' => 'attendance.me.today',
                    'priority' => NotificationPriority::NORMAL->value,
                    'metadata' => [
                        'attendance_date' => $today->toDateString(),
                    ],
                    'dedupe_key' => 'attendance-closed:' . (int) $setting->company_id . ':' . $agentId . ':' . $today->toDateString(),
                ]);

                $closedNoticeCount++;

                if (! in_array($agentId, $clockedInUserIds, true)) {
                    $this->notificationService->notifyUser($agentId, [
                        'company_id' => (int) $setting->company_id,
                        'type' => 'attendance.issue_alert',
                        'category' => NotificationCategory::ATTENDANCE->value,
                        'title' => 'Attendance issue alert',
                        'message' => 'No attendance entry was recorded for you today.',
                        'action_url' => '/agent/operations/attendance',
                        'action_route' => 'attendance.me.today',
                        'priority' => NotificationPriority::HIGH->value,
                        'metadata' => [
                            'attendance_date' => $today->toDateString(),
                            'issue' => 'missing_attendance_entry',
                        ],
                        'dedupe_key' => 'attendance-issue-alert:' . (int) $setting->company_id . ':' . $agentId . ':' . $today->toDateString(),
                    ]);

                    $issueAlertCount++;
                }
            }
        }

        return [
            'auto_clocked_count' => $autoClockedCount,
            'attendance_closed_notices' => $closedNoticeCount,
            'attendance_issue_alerts' => $issueAlertCount,
        ];
    }

    public function countScheduledWorkingDays(Carbon $start, Carbon $end, array $workingDays): int
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

    private function requireSetting(int $companyId): AttendanceSetting
    {
        $setting = AttendanceSetting::query()
            ->where('company_id', $companyId)
            ->first();

        if (! $setting) {
            throw ValidationException::withMessages([
                'attendance_settings' => ['Attendance settings are not configured for this company yet.'],
            ]);
        }

        return $setting;
    }

    private function ensureWorkingDay(Carbon $date, AttendanceSetting $setting): void
    {
        if (! $this->isWorkingDay($date, $setting)) {
            throw ValidationException::withMessages([
                'attendance_date' => ['Clock-in is only allowed on configured working days.'],
            ]);
        }
    }

    private function isWorkingDay(Carbon $date, AttendanceSetting $setting): bool
    {
        $workingDays = $setting->working_days ?? self::DEFAULT_WORKING_DAYS;
        $todayName = strtolower($date->englishDayOfWeek);

        return in_array($todayName, $workingDays, true);
    }

    private function scheduleBoundsForDate(Carbon $date, AttendanceSetting $setting): array
    {
        $day = $date->toDateString();
        $openingTime = Carbon::parse($day . ' ' . (string) $setting->opening_time);
        $closingTime = Carbon::parse($day . ' ' . (string) $setting->closing_time);
        $windowStart = $openingTime->copy()->subMinutes((int) $setting->clockin_window_minutes);

        return [$windowStart, $openingTime, $closingTime];
    }

    private function requiredWorkMinutes(int $companyId, AttendanceSetting $setting): int
    {
        $payrollSetting = PayrollSetting::query()
            ->where('company_id', $companyId)
            ->first();

        if ($payrollSetting && $payrollSetting->work_hours > 0) {
            return (int) $payrollSetting->work_hours * 60;
        }

        $opening = Carbon::parse('1970-01-01 ' . (string) $setting->opening_time);
        $closing = Carbon::parse('1970-01-01 ' . (string) $setting->closing_time);

        return max(0, $opening->diffInMinutes($closing));
    }

    private function notifyAttendanceIssue(User $user, int $companyId, string $issue, string $message): void
    {
        $this->notificationService->notifyUser((int) $user->id, [
            'company_id' => $companyId,
            'type' => 'attendance.issue_alert',
            'category' => NotificationCategory::ATTENDANCE->value,
            'title' => 'Attendance issue alert',
            'message' => $message,
            'action_url' => '/agent/operations/attendance',
            'action_route' => 'attendance.me.today',
            'priority' => NotificationPriority::HIGH->value,
            'created_by_user_id' => (int) $user->id,
            'metadata' => [
                'issue' => $issue,
            ],
            'dedupe_key' => 'attendance-issue:' . $companyId . ':' . (int) $user->id . ':' . $issue . ':' . now()->toDateString(),
        ]);
    }
}
