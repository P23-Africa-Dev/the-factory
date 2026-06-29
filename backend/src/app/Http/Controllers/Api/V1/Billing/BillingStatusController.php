<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Billing;

use App\Http\Controllers\Controller;
use App\Services\Billing\CompanySubscriptionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BillingStatusController extends Controller
{
    public function __construct(private readonly CompanySubscriptionService $service) {}

    public function __invoke(Request $request): JsonResponse
    {
        $companyId = $request->integer('company_id') ?: null;

        return response()->json([
            'success' => true,
            'message' => 'Billing status retrieved.',
            'data' => $this->service->statusForUser($request->user(), $companyId),
            'errors' => null,
        ]);
    }
}
