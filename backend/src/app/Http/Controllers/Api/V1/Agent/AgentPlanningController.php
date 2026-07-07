<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Agent;

use App\Http\Controllers\Controller;
use App\Http\Requests\Planning\AcceptDailyPlanRequest;
use App\Http\Resources\TaskResource;
use App\Services\AI\Planning\PlanAcceptanceService;
use Illuminate\Http\JsonResponse;

class AgentPlanningController extends Controller
{
    public function __construct(private readonly PlanAcceptanceService $planAcceptanceService) {}

    public function accept(AcceptDailyPlanRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $result = $this->planAcceptanceService->accept(
            user: $request->user(),
            companyId: (int) $validated['company_id'],
            planDate: (string) $validated['plan_date'],
            items: $validated['items'],
        );

        return $this->success(
            message: 'Daily plan accepted successfully.',
            data: [
                'created' => TaskResource::collection(collect($result['created'])),
                'skipped' => $result['skipped'],
                'linked_existing' => $result['linked_existing'],
            ],
            status: 201,
        );
    }
}
