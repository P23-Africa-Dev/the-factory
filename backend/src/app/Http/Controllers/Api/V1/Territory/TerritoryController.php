<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Territory;

use App\Http\Controllers\Controller;
use App\Http\Requests\Territory\CoveragePointsRequest;
use App\Http\Requests\Territory\DeleteTerritoryRequest;
use App\Http\Requests\Territory\ListTerritoriesRequest;
use App\Http\Requests\Territory\UpsertTerritoryRequest;
use App\Models\User;
use App\Services\Territory\TerritoryService;
use Illuminate\Http\JsonResponse;

class TerritoryController extends Controller
{
    public function __construct(private readonly TerritoryService $service) {}

    public function index(ListTerritoriesRequest $request): JsonResponse
    {
        $result = $this->service->listForCompany($request->user(), $request->validated());

        return $this->success(
            message: 'Agent territories fetched successfully.',
            data: $result,
        );
    }

    public function coveragePoints(CoveragePointsRequest $request): JsonResponse
    {
        $result = $this->service->coveragePoints($request->user(), $request->validated());

        return $this->success(
            message: 'Territory coverage points fetched successfully.',
            data: $result,
        );
    }

    public function upsert(UpsertTerritoryRequest $request, User $user): JsonResponse
    {
        $result = $this->service->upsertManual($request->user(), $user, $request->validated());

        return $this->success(
            message: 'Agent territory saved successfully.',
            data: $result,
        );
    }

    public function destroy(DeleteTerritoryRequest $request, User $user): JsonResponse
    {
        $result = $this->service->resetToAuto($request->user(), $user, $request->validated());

        return $this->success(
            message: 'Agent territory reset to automatic coverage.',
            data: $result,
        );
    }

    public function agentShow(ListTerritoriesRequest $request): JsonResponse
    {
        $result = $this->service->forAgent($request->user(), $request->validated());

        return $this->success(
            message: 'Agent territory fetched successfully.',
            data: $result,
        );
    }
}
