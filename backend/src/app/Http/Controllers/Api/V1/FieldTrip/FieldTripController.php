<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\FieldTrip;

use App\Http\Controllers\Controller;
use App\Http\Requests\FieldActivity\RecordFieldActivityPointsRequest;
use App\Http\Requests\FieldActivity\StartFieldTripRequest;
use App\Models\FieldActivitySession;
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
            data: $this->sessionService->recordPoints($request->user(), $trip, $request->validated()),
        );
    }
}
