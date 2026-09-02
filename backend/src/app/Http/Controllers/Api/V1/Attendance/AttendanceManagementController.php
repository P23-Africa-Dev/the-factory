<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Attendance;

use App\Http\Controllers\Controller;
use App\Http\Requests\Attendance\AttendanceListRequest;
use App\Http\Requests\Attendance\AttendanceMapSnapshotRequest;
use App\Http\Requests\Attendance\AttendanceMetricsRequest;
use App\Http\Requests\Attendance\AttendancePayrollGenerateRequest;
use App\Http\Requests\Attendance\AttendancePayrollSummaryRequest;
use App\Http\Requests\Attendance\ManagedAttendanceHistoryRequest;
use App\Http\Resources\AttendancePayrollSummaryResource;
use App\Models\User;
use App\Services\Attendance\AttendancePayrollService;
use App\Services\Attendance\AttendanceService;
use Illuminate\Http\JsonResponse;

class AttendanceManagementController extends Controller
{
    public function __construct(
        private readonly AttendanceService $attendanceService,
        private readonly AttendancePayrollService $attendancePayrollService,
    ) {}

    public function metrics(AttendanceMetricsRequest $request): JsonResponse
    {
        $metrics = $this->attendanceService->metricsForManagement(
            user: $request->user(),
            filters: $request->validated(),
        );

        return $this->success(
            message: 'Attendance metrics fetched successfully.',
            data: $metrics,
        );
    }

    public function index(AttendanceListRequest $request): JsonResponse
    {
        $result = $this->attendanceService->listForManagement(
            user: $request->user(),
            filters: $request->validated(),
        );

        return $this->success(
            message: 'Attendance list fetched successfully.',
            data: $result,
        );
    }

    public function agentHistory(ManagedAttendanceHistoryRequest $request, User $agent): JsonResponse
    {
        $history = $this->attendanceService->historyForManagedAgent(
            user: $request->user(),
            agent: $agent,
            filters: $request->validated(),
        );

        return $this->success(
            message: 'Agent attendance history fetched successfully.',
            data: $history,
        );
    }

    public function payrollSummaries(AttendancePayrollSummaryRequest $request): JsonResponse
    {
        $summaries = $this->attendancePayrollService->listForManagement(
            user: $request->user(),
            filters: $request->validated(),
        );

        return $this->success(
            message: 'Attendance payroll summaries fetched successfully.',
            data: [
                'items' => AttendancePayrollSummaryResource::collection($summaries->items()),
                'pagination' => [
                    'next_page_url' => $summaries->nextPageUrl(),
                    'prev_page_url' => $summaries->previousPageUrl(),
                    'per_page' => $summaries->perPage(),
                ],
            ],
        );
    }

    public function generatePayroll(AttendancePayrollGenerateRequest $request): JsonResponse
    {
        $result = $this->attendancePayrollService->generateForManager(
            user: $request->user(),
            filters: $request->validated(),
        );

        return $this->success(
            message: 'Attendance payroll summaries generated successfully.',
            data: $result,
        );
    }

    public function mapSnapshots(AttendanceMapSnapshotRequest $request): JsonResponse
    {
        $snapshot = $this->attendanceService->mapSnapshotsForManagement(
            user: $request->user(),
            filters: $request->validated(),
        );

        return $this->success(
            message: 'Attendance map snapshots fetched successfully.',
            data: $snapshot,
        );
    }
}
