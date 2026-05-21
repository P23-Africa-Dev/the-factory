<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Attendance;

use App\Http\Controllers\Controller;
use App\Http\Requests\Attendance\AttendanceMetricsRequest;
use App\Http\Requests\Attendance\UpsertAttendanceSettingsRequest;
use App\Http\Resources\AttendanceSettingResource;
use App\Services\Attendance\AttendanceSettingsService;
use Illuminate\Http\JsonResponse;

class AttendanceSettingsController extends Controller
{
    public function __construct(private readonly AttendanceSettingsService $attendanceSettingsService) {}

    public function show(AttendanceMetricsRequest $request): JsonResponse
    {
        $setting = $this->attendanceSettingsService->findForManager(
            user: $request->user(),
            companyId: $request->validated('company_id') !== null
                ? (int) $request->validated('company_id')
                : null,
        );

        return $this->success(
            message: 'Attendance settings fetched successfully.',
            data: ['settings' => $setting ? new AttendanceSettingResource($setting) : null],
        );
    }

    public function update(UpsertAttendanceSettingsRequest $request): JsonResponse
    {
        $setting = $this->attendanceSettingsService->upsert(
            user: $request->user(),
            data: $request->validated(),
        );

        return $this->success(
            message: 'Attendance settings updated successfully.',
            data: ['settings' => new AttendanceSettingResource($setting)],
        );
    }
}
