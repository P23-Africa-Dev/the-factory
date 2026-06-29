<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Kpi;

use App\Http\Controllers\Concerns\ResolvesCompanyContextId;
use App\Http\Controllers\Controller;
use App\Http\Requests\Kpi\ListKpisRequest;
use App\Http\Requests\Kpi\StoreKpiRequest;
use App\Http\Requests\Kpi\UpdateKpiRequest;
use App\Http\Resources\KpiResource;
use App\Models\Kpi;
use App\Services\Kpi\KpiService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class KpiController extends Controller
{
    use ResolvesCompanyContextId;

    public function __construct(private readonly KpiService $kpiService) {}

    public function index(ListKpisRequest $request): JsonResponse
    {
        $filters = $request->validated();
        $kpis = $this->kpiService->listForUser($request->user(), $filters);
        $statusCards = $this->kpiService->buildStatusCards($request->user(), $filters);

        return $this->success(
            message: 'KPIs fetched successfully.',
            data: [
                'items' => KpiResource::collection($kpis->items()),
                'status_cards' => $statusCards,
                'pagination' => [
                    'next_page_url' => $kpis->nextPageUrl(),
                    'prev_page_url' => $kpis->previousPageUrl(),
                    'per_page' => $kpis->perPage(),
                    'current_page' => $kpis->currentPage(),
                    'last_page' => $kpis->lastPage(),
                    'total' => $kpis->total(),
                ],
            ],
        );
    }

    public function store(StoreKpiRequest $request): JsonResponse
    {
        $kpi = $this->kpiService->create($request->user(), $request->validated());

        return $this->success(
            message: 'KPI created successfully.',
            data: ['kpi' => new KpiResource($kpi)],
            status: 201,
        );
    }

    public function show(Request $request, Kpi $kpi): JsonResponse
    {
        $kpi = $this->kpiService->findForUser(
            $request->user(),
            $kpi,
            $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'KPI fetched successfully.',
            data: ['kpi' => new KpiResource($kpi)],
        );
    }

    public function update(UpdateKpiRequest $request, Kpi $kpi): JsonResponse
    {
        $kpi = $this->kpiService->update($request->user(), $kpi, $request->validated());

        return $this->success(
            message: 'KPI updated successfully.',
            data: ['kpi' => new KpiResource($kpi)],
        );
    }

    public function destroy(Request $request, Kpi $kpi): JsonResponse
    {
        $this->kpiService->delete(
            $request->user(),
            $kpi,
            $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'KPI deleted successfully.',
            data: ['kpi' => new KpiResource($kpi)],
        );
    }
}
