<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Attendance;

use App\Http\Controllers\Controller;
use App\Http\Requests\Attendance\AttendanceHistoryRequest;
use App\Http\Requests\Attendance\AttendancePayrollSummaryRequest;
use App\Http\Requests\Attendance\AttendanceStatsRequest;
use App\Http\Requests\Attendance\ClockInRequest;
use App\Http\Requests\Attendance\ClockOutRequest;
use App\Http\Requests\Attendance\AttendanceMetricsRequest;
use App\Http\Resources\AttendancePayrollSummaryResource;
use App\Http\Resources\AttendanceRecordResource;
use App\Services\Attendance\AttendancePayrollService;
use App\Services\Attendance\AttendanceService;
use Illuminate\Http\JsonResponse;

class AttendanceAgentController extends Controller
{
    public function __construct(
        private readonly AttendanceService $attendanceService,
        private readonly AttendancePayrollService $attendancePayrollService,
    ) {}

    public function today(AttendanceMetricsRequest $request): JsonResponse
    {
        $today = $this->attendanceService->todayForAgent(
            user: $request->user(),
            companyId: $request->validated('company_id') !== null
                ? (int) $request->validated('company_id')
                : null,
        );

        $record = $today['record'] ?? null;
        unset($today['record']);

        return $this->success(
            message: 'Attendance status fetched successfully.',
            data: [
                ...$today,
                'record' => $record ? new AttendanceRecordResource($record) : null,
            ],
        );
    }

    public function clockIn(ClockInRequest $request): JsonResponse
    {
        $record = $this->attendanceService->clockIn(
            user: $request->user(),
            data: $request->validated(),
        );

        return $this->success(
            message: 'Clock-in recorded successfully.',
            data: ['record' => new AttendanceRecordResource($record)],
            status: 201,
        );
    }

    public function clockOut(ClockOutRequest $request): JsonResponse
    {
        $record = $this->attendanceService->clockOut(
            user: $request->user(),
            data: $request->validated(),
        );

        return $this->success(
            message: 'Clock-out recorded successfully.',
            data: ['record' => new AttendanceRecordResource($record)],
        );
    }

    public function history(AttendanceHistoryRequest $request): JsonResponse
    {
        $records = $this->attendanceService->historyForAgent(
            user: $request->user(),
            filters: $request->validated(),
        );

        return $this->success(
            message: 'Attendance history fetched successfully.',
            data: [
                'items' => AttendanceRecordResource::collection($records->items()),
                'pagination' => [
                    'next_page_url' => $records->nextPageUrl(),
                    'prev_page_url' => $records->previousPageUrl(),
                    'per_page' => $records->perPage(),
                ],
            ],
        );
    }

    public function stats(AttendanceStatsRequest $request): JsonResponse
    {
        $stats = $this->attendanceService->statsForAgent(
            user: $request->user(),
            filters: $request->validated(),
        );

        return $this->success(
            message: 'Attendance stats fetched successfully.',
            data: $stats,
        );
    }

    public function payrollSummary(AttendancePayrollSummaryRequest $request): JsonResponse
    {
        $summary = $this->attendancePayrollService->mySummary(
            user: $request->user(),
            filters: $request->validated(),
        );

        return $this->success(
            message: 'Attendance payroll summary fetched successfully.',
            data: [
                'summary' => $summary ? new AttendancePayrollSummaryResource($summary) : null,
            ],
        );
    }
}
