<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\FieldActivity;

use App\Http\Controllers\Controller;
use App\Http\Requests\FieldActivity\ClassifyFieldStopRequest;
use App\Http\Requests\FieldActivity\FieldJourneyListRequest;
use App\Http\Requests\FieldActivity\FieldJourneyShowRequest;
use App\Http\Requests\FieldActivity\RecordFieldActivityPointsRequest;
use App\Models\FieldActivitySession;
use App\Models\FieldStop;
use App\Services\FieldActivity\FieldActivitySessionService;
use App\Services\FieldActivity\FieldJourneyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FieldActivityAgentController extends Controller
{
    public function __construct(
        private readonly FieldActivitySessionService $sessionService,
        private readonly FieldJourneyService $journeyService,
    ) {}

    public function today(Request $request): JsonResponse
    {
        $companyId = $request->integer('company_id') ?: null;
        $data = $this->sessionService->todayForAgent($request->user(), $companyId);

        return $this->success(
            message: 'Field activity for today loaded.',
            data: $data,
        );
    }

    public function recordPoints(
        RecordFieldActivityPointsRequest $request,
        FieldActivitySession $session,
    ): JsonResponse {
        $result = $this->sessionService->recordPoints(
            $request->user(),
            $session,
            $request->validated(),
        );

        return $this->success(
            message: 'Field activity points recorded.',
            data: $result,
        );
    }

    public function stops(Request $request, FieldActivitySession $session): JsonResponse
    {
        $stops = $this->sessionService->listStops($request->user(), $session);

        return $this->success(
            message: 'Field stops loaded.',
            data: ['stops' => $stops],
        );
    }

    public function classifyStop(
        ClassifyFieldStopRequest $request,
        FieldStop $stop,
    ): JsonResponse {
        $data = $this->sessionService->classifyStop(
            $request->user(),
            $stop,
            $request->validated(),
        );

        return $this->success(
            message: 'Stop classified successfully.',
            data: ['stop' => $data],
        );
    }

    public function dailySummary(Request $request): JsonResponse
    {
        $today = $this->sessionService->todayForAgent(
            $request->user(),
            $request->integer('company_id') ?: null,
        );

        return $this->success(
            message: 'Daily field summary loaded.',
            data: [
                'summary' => $today['summary'],
                'session' => $today['session'],
                'stops' => $today['stops'],
            ],
        );
    }

    public function journeys(FieldJourneyListRequest $request): JsonResponse
    {
        $data = $this->journeyService->listForAgent(
            $request->user(),
            $request->user(),
            $request->validated(),
        );

        return $this->success(
            message: 'Journey history loaded.',
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
}

