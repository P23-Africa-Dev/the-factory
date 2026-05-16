<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Dashboard;

use App\Http\Controllers\Controller;
use App\Http\Requests\Dashboard\FetchDashboardOverviewRequest;
use App\Services\Dashboard\DashboardAggregateService;
use Illuminate\Http\JsonResponse;

class DashboardOverviewController extends Controller
{
    public function __construct(private readonly DashboardAggregateService $service) {}

    public function __invoke(FetchDashboardOverviewRequest $request): JsonResponse
    {
        $overview = $this->service->overview(
            user: $request->user(),
            companyId: $request->validated('company_id') !== null ? (int) $request->validated('company_id') : null,
            fromDate: $request->string('from_date')->toString() ?: null,
            toDate: $request->string('to_date')->toString() ?: null,
        );

        return $this->success(
            message: 'Dashboard overview fetched successfully.',
            data: $overview,
        );
    }
}
