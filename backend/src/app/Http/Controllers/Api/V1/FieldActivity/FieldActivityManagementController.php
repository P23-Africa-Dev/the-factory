<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\FieldActivity;

use App\Http\Controllers\Controller;
use App\Http\Requests\FieldActivity\FieldActivityAnalyticsRequest;
use App\Http\Requests\FieldActivity\FieldActivityLiveRequest;
use App\Http\Requests\FieldActivity\FieldJourneyListRequest;
use App\Http\Requests\FieldActivity\FieldJourneyShowRequest;
use App\Http\Requests\FieldActivity\UpdateFieldActivitySettingsRequest;
use App\Models\FieldActivitySession;
use App\Models\User;
use App\Services\Attendance\AttendanceAccessService;
use App\Services\FieldActivity\FieldActivityAlertService;
use App\Services\FieldActivity\FieldActivityAnalyticsService;
use App\Services\FieldActivity\FieldActivityLiveService;
use App\Services\FieldActivity\FieldActivitySettingService;
use App\Services\FieldActivity\FieldJourneyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FieldActivityManagementController extends Controller
{
    public function __construct(
        private readonly AttendanceAccessService $attendanceAccessService,
        private readonly FieldActivitySettingService $settingService,
        private readonly FieldActivityAnalyticsService $analyticsService,
        private readonly FieldActivityAlertService $alertService,
        private readonly FieldJourneyService $journeyService,
        private readonly FieldActivityLiveService $liveService,
    ) {}

    public function settings(Request $request): JsonResponse
    {
        $context = $this->attendanceAccessService->resolve(
            $request->user(),
            $request->integer('company_id') ?: null,
        );
        $this->attendanceAccessService->ensureCanManage($context);

        return $this->success(
            message: 'Field activity settings loaded.',
            data: [
                'enabled' => $this->settingService->isEnabledForCompany($context->company),
                'company_id' => $context->company->id,
            ],
        );
    }

    public function updateSettings(UpdateFieldActivitySettingsRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $context = $this->attendanceAccessService->resolve(
            $request->user(),
            $validated['company_id'] ?? null,
        );
        $this->attendanceAccessService->ensureCanManage($context);

        $this->settingService->setEnabled($context->company, (bool) $validated['enabled']);

        return $this->success(
            message: 'Field activity settings updated.',
            data: [
                'enabled' => $this->settingService->isEnabledForCompany($context->company->fresh() ?? $context->company),
                'company_id' => $context->company->id,
            ],
        );
    }

    public function analytics(FieldActivityAnalyticsRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $context = $this->attendanceAccessService->resolve(
            $request->user(),
            $validated['company_id'] ?? null,
        );
        $this->attendanceAccessService->ensureCanManage($context);

        $data = $this->analyticsService->companyOverview(
            $context->company,
            $validated['from'] ?? null,
            $validated['to'] ?? null,
            isset($validated['user_id']) ? (int) $validated['user_id'] : null,
        );

        return $this->success(
            message: 'Field activity analytics loaded.',
            data: $data,
        );
    }

    public function runAlerts(Request $request): JsonResponse
    {
        $context = $this->attendanceAccessService->resolve(
            $request->user(),
            $request->integer('company_id') ?: null,
        );
        $this->attendanceAccessService->ensureCanManage($context);

        $result = $this->alertService->scanCompany($context->company);

        return $this->success(
            message: 'Field activity alerts scanned.',
            data: $result,
        );
    }

    public function agentJourneys(FieldJourneyListRequest $request, User $agent): JsonResponse
    {
        $data = $this->journeyService->listForAgent(
            $request->user(),
            $agent,
            $request->validated(),
        );

        return $this->success(
            message: 'Agent journey history loaded.',
            data: $data,
        );
    }

    public function showJourney(FieldJourneyShowRequest $request, FieldActivitySession $session): JsonResponse
    {
        $data = $this->journeyService->showJourney(
            $request->user(),
            $session,
            $request->validated(),
        );

        return $this->success(
            message: 'Journey loaded.',
            data: $data,
        );
    }

    public function live(FieldActivityLiveRequest $request): JsonResponse
    {
        $data = $this->liveService->liveForManagement(
            $request->user(),
            $request->validated(),
        );

        return $this->success(
            message: 'Field activity live map hydrated.',
            data: $data,
        );
    }
}

