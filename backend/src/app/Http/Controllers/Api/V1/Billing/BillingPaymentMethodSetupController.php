<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Billing;

use App\Http\Controllers\Controller;
use App\Services\Billing\BillingPaymentMethodService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BillingPaymentMethodSetupController extends Controller
{
    public function __construct(private readonly BillingPaymentMethodService $service) {}

    public function __invoke(Request $request): JsonResponse
    {
        $data = $this->service->createSetupIntent(
            $request->user(),
            $request->integer('company_id') ?: null,
        );

        return response()->json([
            'success' => true,
            'message' => 'Card setup session created.',
            'data' => $data,
            'errors' => null,
        ]);
    }
}
