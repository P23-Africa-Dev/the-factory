<?php

declare(strict_types=1);

namespace App\Services\Attendance;

use App\Enums\NotificationCategory;
use App\Enums\NotificationPriority;
use App\Models\AttendanceSetting;
use App\Models\User;
use App\Services\Notification\NotificationService;
use Carbon\Carbon;
use Illuminate\Validation\ValidationException;

class AttendanceSettingsService
{
    public function __construct(
        private readonly AttendanceAccessService $attendanceAccessService,
        private readonly NotificationService $notificationService,
    ) {}

    public function findForManager(User $user, ?int $companyId = null): ?AttendanceSetting
    {
        $context = $this->attendanceAccessService->resolve($user, $companyId);
        $this->attendanceAccessService->ensureCanManage($context);

        return AttendanceSetting::query()
            ->where('company_id', $context->company->id)
            ->first();
    }

    public function upsert(User $user, array $data): AttendanceSetting
    {
        $context = $this->attendanceAccessService->resolve($user, $data['company_id'] ?? null);
        $this->attendanceAccessService->ensureCanManage($context);

        $opening = Carbon::createFromFormat('H:i', (string) $data['opening_time']);
        $closing = Carbon::createFromFormat('H:i', (string) $data['closing_time']);

        if (! $opening->lt($closing)) {
            throw ValidationException::withMessages([
                'closing_time' => ['Closing time must be later than opening time.'],
            ]);
        }

        $setting = AttendanceSetting::query()->updateOrCreate(
            ['company_id' => $context->company->id],
            [
                'opening_time' => $opening->format('H:i:s'),
                'closing_time' => $closing->format('H:i:s'),
                'working_days' => $data['working_days'],
                'clockin_window_minutes' => (int) ($data['clockin_window_minutes'] ?? 15),
                'auto_clockout_enabled' => (bool) ($data['auto_clockout_enabled'] ?? true),
            ],
        );

        $this->notificationService->notifyCompanyRoles(
            companyId: (int) $context->company->id,
            roles: ['owner', 'admin', 'supervisor'],
            payload: [
                'type' => 'attendance.settings_updated',
                'category' => NotificationCategory::ATTENDANCE->value,
                'title' => 'Attendance settings updated',
                'message' => 'Attendance settings have been updated for your company.',
                'reference_type' => AttendanceSetting::class,
                'reference_id' => (int) $setting->id,
                'action_url' => '/operations/attendance',
                'action_route' => 'attendance.settings.show',
                'priority' => NotificationPriority::NORMAL->value,
                'created_by_user_id' => (int) $user->id,
                'metadata' => [
                    'opening_time' => $setting->opening_time,
                    'closing_time' => $setting->closing_time,
                    'working_days' => $setting->working_days,
                ],
                'dedupe_key' => 'attendance-settings-updated:' . (int) $context->company->id . ':' . ($setting->updated_at?->timestamp ?? now()->timestamp),
            ],
            excludeUserIds: [(int) $user->id],
        );

        return $setting;
    }
}
