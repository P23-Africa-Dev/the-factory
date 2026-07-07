<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Internal;

use App\Http\Controllers\Controller;
use App\Http\Requests\Internal\StoreCompanyZoneRequest;
use App\Http\Requests\Internal\UpdateCompanyZoneRequest;
use App\Http\Resources\CompanyZoneResource;
use App\Models\CompanyZone;
use App\Services\Internal\CompanyZoneService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CompanyZoneController extends Controller
{
    public function __construct(
        private readonly CompanyZoneService $zoneService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $zones = $this->zoneService->listForManager($request->user(), [
            'company_id' => $request->input('company_id'),
            'q' => $request->input('q'),
            'is_active' => $request->has('is_active') ? $request->boolean('is_active') : null,
        ]);

        return $this->success(
            message: 'Company zones fetched successfully.',
            data: CompanyZoneResource::collection($zones),
        );
    }

    public function store(StoreCompanyZoneRequest $request): JsonResponse
    {
        $zone = $this->zoneService->create($request->user(), $request->validated());

        return $this->success(
            message: 'Company zone created successfully.',
            data: ['zone' => new CompanyZoneResource($zone)],
            status: 201,
        );
    }

    public function update(UpdateCompanyZoneRequest $request, CompanyZone $zone): JsonResponse
    {
        $updated = $this->zoneService->update($request->user(), $zone, $request->validated());

        return $this->success(
            message: 'Company zone updated successfully.',
            data: ['zone' => new CompanyZoneResource($updated)],
        );
    }

    public function destroy(Request $request, CompanyZone $zone): JsonResponse
    {
        $companyId = $request->input('company_id');
        $this->zoneService->delete($request->user(), $zone, is_numeric($companyId) ? (int) $companyId : null);

        return $this->success(
            message: 'Company zone deleted successfully.',
            data: ['deleted_zone_id' => (int) $zone->id],
        );
    }
}

