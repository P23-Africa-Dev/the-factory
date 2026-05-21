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
use App\Services\Notification\NotificationService;
use Carbon\Carbon;
use Illuminate\Contracts\Pagination\Paginator;
use Illuminate\Support\Collection;
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

        [, , $closingTime] = $this->scheduleBoundsForDate($clockOutAt, $setting);

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
+
+        $record->update([
+            'clock_out_at' => $clockOutAt,
+            'work_duration_minutes' => $workDurationMinutes,
+            'metadata' => $metadata,
+        ]);
+
+        $this->notificationService->notifyUser((int) $user->id, [
+            'company_id' => (int) $context->company->id,
+            'type' => 'attendance.clock_out_success',
+            'category' => NotificationCategory::ATTENDANCE->value,
+            'title' => 'Clock-out successful',
+            'message' => 'Your attendance clock-out was recorded successfully.',
+            'reference_type' => AttendanceRecord::class,
+            'reference_id' => (int) $record->id,
+            'action_url' => '/agent/operations/attendance',
+            'action_route' => 'attendance.me.today',
+            'priority' => NotificationPriority::NORMAL->value,
+            'created_by_user_id' => (int) $user->id,
+            'metadata' => [
+                'attendance_date' => $attendanceDate,
+                'clock_out_at' => $clockOutAt->toIso8601String(),
+                'work_duration_minutes' => $workDurationMinutes,
+            ],
+            'dedupe_key' => 'attendance-clock-out:' . (int) $context->company->id . ':' . (int) $user->id . ':' . $attendanceDate,
+        ]);
+
+        return $record->fresh();
+    }
+
+    public function todayForAgent(User $user, ?int $companyId = null): array
+    {
+        $context = $this->attendanceAccessService->resolve($user, $companyId);
+        $this->attendanceAccessService->ensureAgent($context);
+
+        $now = now();
+        $setting = $this->requireSetting((int) $context->company->id);
+        [$windowStart, $openingTime, $closingTime] = $this->scheduleBoundsForDate($now, $setting);
+
+        $attendanceDate = $now->toDateString();
+
+        $record = AttendanceRecord::query()
+            ->where('company_id', $context->company->id)
+            ->where('user_id', $user->id)
+            ->whereDate('attendance_date', $attendanceDate)
+            ->first();
+
+        $workingDay = $this->isWorkingDay($now, $setting);
+        $windowActive = $workingDay && $now->betweenIncluded($windowStart, $closingTime);
+
+        return [
+            'company_id' => (int) $context->company->id,
+            'attendance_date' => $attendanceDate,
+            'working_day' => $workingDay,
+            'window_start_at' => $windowStart->toIso8601String(),
+            'opening_at' => $openingTime->toIso8601String(),
+            'closing_at' => $closingTime->toIso8601String(),
+            'window_active' => $windowActive,
+            'actions_locked_until_next_workday' => $now->gt($closingTime),
+            'can_clock_in' => $record === null && $windowActive,
+            'can_clock_out' => $record !== null && $record->clock_out_at === null && $now->lte($closingTime),
+            'record' => $record,
+            'status' => $record?->status?->value ?? ($workingDay && $now->gt($closingTime) ? 'absent' : 'not_started'),
+        ];
+    }
+
+    public function historyForAgent(User $user, array $filters): Paginator
+    {
+        $context = $this->attendanceAccessService->resolve($user, $filters['company_id'] ?? null);
+        $this->attendanceAccessService->ensureAgent($context);
+
+        $query = AttendanceRecord::query()
+            ->where('company_id', $context->company->id)
+            ->where('user_id', $user->id)
+            ->latest('attendance_date');
+
+        if (! empty($filters['from_date'])) {
+            $query->whereDate('attendance_date', '>=', (string) $filters['from_date']);
+        }
+
+        if (! empty($filters['to_date'])) {
+            $query->whereDate('attendance_date', '<=', (string) $filters['to_date']);
+        }
+
+        if (! empty($filters['status'])) {
+            $query->where('status', (string) $filters['status']);
+        }
+
+        return $query->simplePaginate((int) ($filters['per_page'] ?? 20))->withQueryString();
+    }
+
+    public function statsForAgent(User $user, array $filters): array
+    {
+        $context = $this->attendanceAccessService->resolve($user, $filters['company_id'] ?? null);
+        $this->attendanceAccessService->ensureAgent($context);
+
+        $year = (int) $filters['year'];
+        $month = (int) $filters['month'];
+
+        $periodStart = Carbon::create($year, $month, 1)->startOfMonth();
+        $periodEnd = $periodStart->copy()->endOfMonth();
+
+        $setting = $this->requireSetting((int) $context->company->id);
+
+        $records = AttendanceRecord::query()
+            ->where('company_id', $context->company->id)
+            ->where('user_id', $user->id)
+            ->whereBetween('attendance_date', [$periodStart->toDateString(), $periodEnd->toDateString()])
+            ->get();
+
+        $requiredMinutes = $this->requiredWorkMinutes((int) $context->company->id, $setting);
+
+        $presentDays = $records
+            ->filter(fn(AttendanceRecord $record): bool => in_array($record->status?->value, [
+                AttendanceStatus::PRESENT->value,
+                AttendanceStatus::LATE->value,
+                AttendanceStatus::AUTO_CLOCKED_OUT->value,
+            ], true))
+            ->count();
+
+        $lateDays = $records->where('status', AttendanceStatus::LATE)->count();
+        $autoClockedDays = $records->where('status', AttendanceStatus::AUTO_CLOCKED_OUT)->count();
+
+        $undertimeDays = $records
+            ->filter(static fn(AttendanceRecord $record): bool => $record->clock_out_at !== null
+                && $record->work_duration_minutes !== null
+                && $record->work_duration_minutes < $requiredMinutes)
+            ->count();
+
+        $scheduledDays = $this->countScheduledWorkingDays(
+            $periodStart,
+            $periodEnd,
+            $setting->working_days ?? self::DEFAULT_WORKING_DAYS,
+        );
+
+        return [
+            'period_year' => $year,
+            'period_month' => $month,
+            'scheduled_working_days' => $scheduledDays,
+            'present_days' => $presentDays,
+            'absent_days' => max(0, $scheduledDays - $presentDays),
+            'late_days' => $lateDays,
+            'auto_clocked_days' => $autoClockedDays,
+            'undertime_days' => $undertimeDays,
+            'attendance_percentage' => $scheduledDays > 0
+                ? round(($presentDays / $scheduledDays) * 100, 2)
+                : 0.0,
+        ];
+    }
+
+    public function metricsForManagement(User $user, array $filters): array
+    {
+        $context = $this->attendanceAccessService->resolve($user, $filters['company_id'] ?? null);
+        $this->attendanceAccessService->ensureCanManage($context);
+
+        $date = ! empty($filters['date'])
+            ? Carbon::parse((string) $filters['date'])->toDateString()
+            : now()->toDateString();
+
+        $totalWorkforce = DB::table('company_users')
+            ->where('company_id', $context->company->id)
+            ->where('role', 'agent')
+            ->count();
+
+        $records = AttendanceRecord::query()
+            ->where('company_id', $context->company->id)
+            ->whereDate('attendance_date', $date);
+
+        $present = (clone $records)
+            ->whereIn('status', [
+                AttendanceStatus::PRESENT->value,
+                AttendanceStatus::LATE->value,
+                AttendanceStatus::AUTO_CLOCKED_OUT->value,
+            ])
+            ->count();
+
+        $late = (clone $records)->where('status', AttendanceStatus::LATE->value)->count();
+        $autoClocked = (clone $records)->where('status', AttendanceStatus::AUTO_CLOCKED_OUT->value)->count();
+        $absent = max(0, (int) $totalWorkforce - (int) $present);
+
+        return [
+            'date' => $date,
+            'total_workforce' => (int) $totalWorkforce,
+            'present' => (int) $present,
+            'absent' => (int) $absent,
+            'late' => (int) $late,
+            'auto_clocked' => (int) $autoClocked,
+            'attendance_percentage' => $totalWorkforce > 0
+                ? round(((int) $present / (int) $totalWorkforce) * 100, 2)
+                : 0.0,
+        ];
+    }
+
+    public function listForManagement(User $user, array $filters): array
+    {
+        $context = $this->attendanceAccessService->resolve($user, $filters['company_id'] ?? null);
+        $this->attendanceAccessService->ensureCanManage($context);
+
+        $date = ! empty($filters['date'])
+            ? Carbon::parse((string) $filters['date'])->toDateString()
+            : now()->toDateString();
+
+        $query = DB::table('company_users as cu')
+            ->join('users as u', 'u.id', '=', 'cu.user_id')
+            ->leftJoin('attendance_records as ar', function ($join) use ($date): void {
+                $join->on('ar.user_id', '=', 'u.id')
+                    ->on('ar.company_id', '=', 'cu.company_id')
+                    ->whereDate('ar.attendance_date', '=', $date);
+            })
+            ->where('cu.company_id', $context->company->id)
+            ->where('cu.role', 'agent')
+            ->select([
+                'u.id as user_id',
+                'u.name as agent_name',
+                'u.avatar',
+                'u.assigned_zone',
+                'u.internal_role',
+                'ar.id as attendance_record_id',
+                'ar.clock_in_at',
+                'ar.clock_out_at',
+                'ar.status',
+                'ar.work_duration_minutes',
+                'ar.is_late',
+                'ar.is_auto_clocked_out',
+            ]);
+
+        if (! empty($filters['search'])) {
+            $search = '%' . trim((string) $filters['search']) . '%';
+            $query->where(function ($sub) use ($search): void {
+                $sub->where('u.name', 'like', $search)
+                    ->orWhere('u.email', 'like', $search)
+                    ->orWhere('u.assigned_zone', 'like', $search);
+            });
+        }
+
+        if (! empty($filters['status'])) {
+            $status = (string) $filters['status'];
+
+            if ($status === 'absent') {
+                $query->whereNull('ar.id');
+            } else {
+                $query->where('ar.status', $status);
+            }
+        }
+
+        $paginated = $query
+            ->orderBy('u.name')
+            ->simplePaginate((int) ($filters['per_page'] ?? 20))
+            ->withQueryString();
+
+        $items = collect($paginated->items())->map(static function (object $item) use ($date): array {
+            $status = $item->status !== null ? (string) $item->status : 'absent';
+
+            return [
+                'user_id' => (int) $item->user_id,
+                'agent_name' => (string) $item->agent_name,
+                'avatar' => $item->avatar,
+                'zone' => $item->assigned_zone,
+                'role' => $item->internal_role,
+                'attendance_date' => $date,
+                'clock_in_at' => $item->clock_in_at ? Carbon::parse((string) $item->clock_in_at)->toIso8601String() : null,
+                'clock_out_at' => $item->clock_out_at ? Carbon::parse((string) $item->clock_out_at)->toIso8601String() : null,
+                'status' => $status,
+                'work_duration_minutes' => $item->work_duration_minutes !== null ? (int) $item->work_duration_minutes : null,
+                'is_late' => (bool) ($item->is_late ?? false),
+                'is_auto_clocked_out' => (bool) ($item->is_auto_clocked_out ?? false),
+            ];
+        })->values()->all();
+
+        return [
+            'date' => $date,
+            'items' => $items,
+            'pagination' => [
+                'next_page_url' => $paginated->nextPageUrl(),
+                'prev_page_url' => $paginated->previousPageUrl(),
+                'per_page' => $paginated->perPage(),
+            ],
+        ];
+    }
+
+    public function autoClockOutForOpenRecords(?int $companyId = null): array
+    {
+        $settings = AttendanceSetting::query()
+            ->where('auto_clockout_enabled', true)
+            ->when($companyId !== null, fn($query) => $query->where('company_id', $companyId))
+            ->get();
+
+        $autoClockedCount = 0;
+        $closedNoticeCount = 0;
+        $issueAlertCount = 0;
+
+        foreach ($settings as $setting) {
+            $openRecords = AttendanceRecord::query()
+                ->where('company_id', $setting->company_id)
+                ->whereNull('clock_out_at')
+                ->whereNotNull('clock_in_at')
+                ->whereDate('attendance_date', '<=', now()->toDateString())
+                ->get();
+
+            foreach ($openRecords as $record) {
+                $attendanceDate = Carbon::parse((string) $record->attendance_date);
+                [, , $closingTime] = $this->scheduleBoundsForDate($attendanceDate, $setting);
+
+                if (now()->lt($closingTime)) {
+                    continue;
+                }
+
+                $workDurationMinutes = max(0, $record->clock_in_at?->diffInMinutes($closingTime) ?? 0);
+
+                $record->update([
+                    'clock_out_at' => $closingTime,
+                    'status' => AttendanceStatus::AUTO_CLOCKED_OUT->value,
+                    'is_auto_clocked_out' => true,
+                    'work_duration_minutes' => $workDurationMinutes,
+                ]);
+
+                $this->notificationService->notifyUser((int) $record->user_id, [
+                    'company_id' => (int) $record->company_id,
+                    'type' => 'attendance.auto_clock_out',
+                    'category' => NotificationCategory::ATTENDANCE->value,
+                    'title' => 'Auto clock-out applied',
+                    'message' => 'You were automatically clocked out at company closing time.',
+                    'reference_type' => AttendanceRecord::class,
+                    'reference_id' => (int) $record->id,
+                    'action_url' => '/agent/operations/attendance',
+                    'action_route' => 'attendance.me.today',
+                    'priority' => NotificationPriority::HIGH->value,
+                    'created_by_user_id' => null,
+                    'metadata' => [
+                        'attendance_date' => $record->attendance_date?->toDateString(),
+                        'clock_out_at' => $closingTime->toIso8601String(),
+                    ],
+                    'dedupe_key' => 'attendance-auto-clock-out:' . (int) $record->id,
+                ]);
+
+                $autoClockedCount++;
+            }
+
+            $today = now();
+            if (! $this->isWorkingDay($today, $setting)) {
+                continue;
+            }
+
+            [, , $todayClosing] = $this->scheduleBoundsForDate($today, $setting);
+            if (now()->lt($todayClosing)) {
+                continue;
+            }
+
+            $agentIds = DB::table('company_users')
+                ->where('company_id', $setting->company_id)
+                ->where('role', 'agent')
+                ->pluck('user_id')
+                ->map(static fn(mixed $id): int => (int) $id)
+                ->all();
+
+            $clockedInUserIds = AttendanceRecord::query()
+                ->where('company_id', $setting->company_id)
+                ->whereDate('attendance_date', $today->toDateString())
+                ->whereNotNull('clock_in_at')
+                ->pluck('user_id')
+                ->map(static fn(mixed $id): int => (int) $id)
+                ->all();
+
+            foreach ($agentIds as $agentId) {
+                $this->notificationService->notifyUser($agentId, [
+                    'company_id' => (int) $setting->company_id,
+                    'type' => 'attendance.closed',
+                    'category' => NotificationCategory::ATTENDANCE->value,
+                    'title' => 'Attendance closed',
+                    'message' => 'Attendance actions for today are now closed.',
+                    'action_url' => '/agent/operations/attendance',
+                    'action_route' => 'attendance.me.today',
+                    'priority' => NotificationPriority::NORMAL->value,
+                    'metadata' => [
+                        'attendance_date' => $today->toDateString(),
+                    ],
+                    'dedupe_key' => 'attendance-closed:' . (int) $setting->company_id . ':' . $agentId . ':' . $today->toDateString(),
+                ]);
+
+                $closedNoticeCount++;
+
+                if (! in_array($agentId, $clockedInUserIds, true)) {
+                    $this->notificationService->notifyUser($agentId, [
+                        'company_id' => (int) $setting->company_id,
+                        'type' => 'attendance.issue_alert',
+                        'category' => NotificationCategory::ATTENDANCE->value,
+                        'title' => 'Attendance issue alert',
+                        'message' => 'No attendance entry was recorded for you today.',
+                        'action_url' => '/agent/operations/attendance',
+                        'action_route' => 'attendance.me.today',
+                        'priority' => NotificationPriority::HIGH->value,
+                        'metadata' => [
+                            'attendance_date' => $today->toDateString(),
+                            'issue' => 'missing_attendance_entry',
+                        ],
+                        'dedupe_key' => 'attendance-issue-alert:' . (int) $setting->company_id . ':' . $agentId . ':' . $today->toDateString(),
+                    ]);
+
+                    $issueAlertCount++;
+                }
+            }
+        }
+
+        return [
+            'auto_clocked_count' => $autoClockedCount,
+            'attendance_closed_notices' => $closedNoticeCount,
+            'attendance_issue_alerts' => $issueAlertCount,
+        ];
+    }
+
+    public function countScheduledWorkingDays(Carbon $start, Carbon $end, array $workingDays): int
+    {
+        $normalized = collect($workingDays)
+            ->map(static fn(mixed $day): string => strtolower((string) $day))
+            ->filter()
+            ->unique()
+            ->values()
+            ->all();
+
+        if ($normalized === []) {
+            $normalized = self::DEFAULT_WORKING_DAYS;
+        }
+
+        $cursor = $start->copy()->startOfDay();
+        $last = $end->copy()->startOfDay();
+        $count = 0;
+
+        while ($cursor->lte($last)) {
+            if (in_array(strtolower($cursor->englishDayOfWeek), $normalized, true)) {
+                $count++;
+            }
+
+            $cursor->addDay();
+        }
+
+        return $count;
+    }
+
+    private function requireSetting(int $companyId): AttendanceSetting
+    {
+        $setting = AttendanceSetting::query()
+            ->where('company_id', $companyId)
+            ->first();
+
+        if (! $setting) {
+            throw ValidationException::withMessages([
+                'attendance_settings' => ['Attendance settings are not configured for this company yet.'],
+            ]);
+        }
+
+        return $setting;
+    }
+
+    private function ensureWorkingDay(Carbon $date, AttendanceSetting $setting): void
+    {
+        if (! $this->isWorkingDay($date, $setting)) {
+            throw ValidationException::withMessages([
+                'attendance_date' => ['Clock-in is only allowed on configured working days.'],
+            ]);
+        }
+    }
+
+    private function isWorkingDay(Carbon $date, AttendanceSetting $setting): bool
+    {
+        $workingDays = $setting->working_days ?? self::DEFAULT_WORKING_DAYS;
+        $todayName = strtolower($date->englishDayOfWeek);
+
+        return in_array($todayName, $workingDays, true);
+    }
+
+    private function scheduleBoundsForDate(Carbon $date, AttendanceSetting $setting): array
+    {
+        $day = $date->toDateString();
+        $openingTime = Carbon::parse($day . ' ' . (string) $setting->opening_time);
+        $closingTime = Carbon::parse($day . ' ' . (string) $setting->closing_time);
+        $windowStart = $openingTime->copy()->subMinutes((int) $setting->clockin_window_minutes);
+
+        return [$windowStart, $openingTime, $closingTime];
+    }
+
+    private function requiredWorkMinutes(int $companyId, AttendanceSetting $setting): int
+    {
+        $payrollSetting = PayrollSetting::query()
+            ->where('company_id', $companyId)
+            ->first();
+
+        if ($payrollSetting && $payrollSetting->work_hours > 0) {
+            return (int) $payrollSetting->work_hours * 60;
+        }
+
+        $opening = Carbon::parse('1970-01-01 ' . (string) $setting->opening_time);
+        $closing = Carbon::parse('1970-01-01 ' . (string) $setting->closing_time);
+
+        return max(0, $opening->diffInMinutes($closing));
+    }
+
+    private function notifyAttendanceIssue(User $user, int $companyId, string $issue, string $message): void
+    {
+        $this->notificationService->notifyUser((int) $user->id, [
+            'company_id' => $companyId,
+            'type' => 'attendance.issue_alert',
+            'category' => NotificationCategory::ATTENDANCE->value,
+            'title' => 'Attendance issue alert',
+            'message' => $message,
+            'action_url' => '/agent/operations/attendance',
+            'action_route' => 'attendance.me.today',
+            'priority' => NotificationPriority::HIGH->value,
+            'created_by_user_id' => (int) $user->id,
+            'metadata' => [
+                'issue' => $issue,
+            ],
+            'dedupe_key' => 'attendance-issue:' . $companyId . ':' . (int) $user->id . ':' . $issue . ':' . now()->toDateString(),
+        ]);
+    }
+}
