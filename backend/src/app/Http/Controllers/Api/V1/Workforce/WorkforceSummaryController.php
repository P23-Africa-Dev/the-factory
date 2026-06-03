<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Workforce;

use App\Http\Controllers\Controller;
use App\Http\Requests\Dashboard\FetchWorkforceSummaryRequest;
use App\Services\Workforce\WorkforceSummaryService;
use Illuminate\Http\JsonResponse;

class WorkforceSummaryController extends Controller
{
    public function __construct(private readonly WorkforceSummaryService $service) {}

    public function __invoke(FetchWorkforceSummaryRequest $request): JsonResponse
    {
        $summary = $this->service->summary(
            user: $request->user(),
            companyId: $request->validated('company_id') !== null ? (int) $request->validated('company_id') : null,
            fromDate: $request->string('from_date')->toString() ?: null,
            toDate: $request->string('to_date')->toString() ?: null,
        );

        return $this->success(
            message: 'Workforce summary fetched successfully.',
            data: $summary,
        );
    }
}
