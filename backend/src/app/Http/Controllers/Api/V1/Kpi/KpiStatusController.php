<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Kpi;

use App\Http\Controllers\Controller;
use App\Http\Requests\Kpi\UpdateKpiStatusRequest;
use App\Http\Resources\KpiResource;
use App\Models\Kpi;
use App\Services\Kpi\KpiService;
use Illuminate\Http\JsonResponse;

class KpiStatusController extends Controller
{
    public function __construct(private readonly KpiService $kpiService) {}

    public function update(UpdateKpiStatusRequest $request, Kpi $kpi): JsonResponse
    {
        $companyId = $request->validated('company_id');
        $status = (string) $request->validated('status');

        $updatedKpi = $this->kpiService->updateStatus(
            user: $request->user(),
            kpi: $kpi,
            status: $status,
            companyId: $companyId !== null ? (int) $companyId : null,
        );

        return $this->success(
            message: 'KPI status updated successfully.',
            data: ['kpi' => new KpiResource($updatedKpi)],
        );
    }
}
