<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Billing;

use App\Http\Controllers\Controller;
use App\Services\Billing\CompanySubscriptionService;
use App\Support\Billing\BillingPlanCatalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BillingPlansController extends Controller
{
    public function __invoke(Request $request, CompanySubscriptionService $service): JsonResponse
    {
        $status = $service->statusForUser($request->user());
        $lockedPlan = $status['can_choose_plan'] ? null : ($status['assigned_plan_key'] ?? null);

        return response()->json([
            'success' => true,
            'message' => 'Billing plans retrieved.',
            'data' => [
                'plans' => BillingPlanCatalog::publicCatalog($lockedPlan),
                'billing_status' => $status,
            ],
            'errors' => null,
        ]);
    }
}
