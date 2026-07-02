<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Billing;

use App\Http\Controllers\Controller;
use App\Services\Billing\CompanySubscriptionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BillingPortalController extends Controller
{
    public function __construct(private readonly CompanySubscriptionService $service) {}

    public function __invoke(Request $request): JsonResponse
    {
        $url = $this->service->createPortalSession(
            $request->user(),
            $request->integer('company_id') ?: null,
        );

        return response()->json([
            'success' => true,
            'message' => 'Billing portal session created.',
            'data' => ['portal_url' => $url],
            'errors' => null,
        ]);
    }
}
