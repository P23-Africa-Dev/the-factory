<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\FieldTrip;

use App\Http\Controllers\Controller;
use App\Http\Requests\FieldActivity\ClassifyFieldStopRequest;
use App\Http\Requests\FieldActivity\RecordFieldActivityPointsRequest;
use App\Http\Requests\FieldActivity\StartFieldTripRequest;
use App\Models\FieldActivitySession;
use App\Models\FieldStop;
use App\Services\FieldActivity\FieldActivitySessionService;
use App\Services\FieldActivity\FieldTripService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Field Trips for every company member (agents and managers):
 * "Start Field Trip" / "End Field Trip" on the mobile dashboard.
 */
class FieldTripController extends Controller
{
    public function __construct(
        private readonly FieldTripService $tripService,
        private readonly FieldActivitySessionService $sessionService,
    ) {}

    public function current(Request $request): JsonResponse
    {
        return $this->success(
            message: 'Field trip status loaded.',
            data: $this->tripService->current($request->user(), $request->integer('company_id') ?: null),
        );
    }

    public function start(StartFieldTripRequest $request): JsonResponse
    {
        $result = $this->tripService->start($request->user(), $request->validated());

        return $this->success(
            message: $result['created'] ? 'Field trip started.' : 'Field trip already in progress.',
            data: $result,
            status: $result['created'] ? 201 : 200,
        );
    }

    public function end(StartFieldTripRequest $request, FieldActivitySession $trip): JsonResponse
    {
        $result = $this->tripService->end($request->user(), $trip, $request->validated());

        return $this->success(message: 'Field trip ended.', data: $result);
    }

    public function points(RecordFieldActivityPointsRequest $request, FieldActivitySession $trip): JsonResponse
    {
        return $this->success(
            message: 'Field trip points recorded.',
            data: $this->sessionService->recordPoints(
                $request->user(),
                $trip,
                $request->validated(),
                FieldActivitySessionService::ENDPOINT_FIELD_TRIP,
            ),
        );
    }

    /** The phone's tracking health report for its own trip (shown to managers). */
    public function health(Request $request, FieldActivitySession $trip): JsonResponse
    {
        $data = $request->validate([
            'company_id' => ['nullable', 'integer'],
            'source' => ['nullable', 'string', 'in:native,web'],
            'app_version' => ['nullable', 'string', 'max:20'],
            'app_state' => ['nullable', 'string', 'max:20'],
            'permission' => ['nullable', 'string', 'max:20'],
            'precise' => ['nullable', 'boolean'],
            'location_services_on' => ['nullable', 'boolean'],
            'battery_optimized' => ['nullable', 'boolean'],
            'fixes' => ['nullable', 'integer', 'min:0'],
            'last_fix_at' => ['nullable', 'date'],
            'last_accuracy_m' => ['nullable', 'numeric', 'min:0'],
            'queued' => ['nullable', 'integer', 'min:0'],
            'uploaded' => ['nullable', 'integer', 'min:0'],
            'failed_uploads' => ['nullable', 'integer', 'min:0'],
            'last_error' => ['nullable', 'string', 'max:1000'],
            'reported_at' => ['nullable', 'date'],
        ]);

        return $this->success(
            message: 'Tracking health recorded.',
            data: $this->tripService->recordHealth($request->user(), $trip, $data),
        );
    }

    /** Today's field activity for the caller (every trip of the day). Any member. */
    public function today(Request $request): JsonResponse
    {
        return $this->success(
            message: 'Field activity for today loaded.',
            data: $this->sessionService->todayForAgent($request->user(), $request->integer('company_id') ?: null),
        );
    }

    /** The caller's unclassified stops from ended trips. Any member. */
    public function pendingReview(Request $request): JsonResponse
    {
        return $this->success(
            message: 'Pending field stop review loaded.',
            data: $this->sessionService->pendingReviewForAgent($request->user(), $request->integer('company_id') ?: null),
        );
    }

    /** Stops of one of the caller's own trips. Any member. */
    public function stops(Request $request, FieldActivitySession $trip): JsonResponse
    {
        return $this->success(
            message: 'Field stops loaded.',
            data: ['stops' => $this->sessionService->listStops($request->user(), $trip)],
        );
    }

    /** Classify one of the caller's own stops. Any member. */
    public function classifyStop(ClassifyFieldStopRequest $request, FieldStop $stop): JsonResponse
    {
        return $this->success(
            message: 'Stop classified successfully.',
            data: ['stop' => $this->sessionService->classifyStop($request->user(), $stop, $request->validated())],
        );
    }
}
