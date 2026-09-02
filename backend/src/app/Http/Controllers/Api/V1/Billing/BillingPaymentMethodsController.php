<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Billing;

use App\Http\Controllers\Controller;
use App\Services\Billing\BillingPaymentMethodService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BillingPaymentMethodsController extends Controller
{
    public function __construct(private readonly BillingPaymentMethodService $service) {}

    public function index(Request $request): JsonResponse
    {
        $data = $this->service->listForUser(
            $request->user(),
            $request->integer('company_id') ?: null,
        );

        return response()->json([
            'success' => true,
            'message' => 'Payment methods fetched successfully.',
            'data' => $data,
            'errors' => null,
        ]);
    }
}
