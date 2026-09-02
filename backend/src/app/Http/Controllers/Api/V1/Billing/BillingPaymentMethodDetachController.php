<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Billing;

use App\Http\Controllers\Controller;
use App\Services\Billing\BillingPaymentMethodService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BillingPaymentMethodDetachController extends Controller
{
    public function __construct(private readonly BillingPaymentMethodService $service) {}

    public function __invoke(Request $request, string $paymentMethodId): JsonResponse
    {
        $data = $this->service->detach(
            $request->user(),
            $paymentMethodId,
            $request->integer('company_id') ?: null,
        );

        return response()->json([
            'success' => true,
            'message' => 'Payment method removed.',
            'data' => $data,
            'errors' => null,
        ]);
    }
}
