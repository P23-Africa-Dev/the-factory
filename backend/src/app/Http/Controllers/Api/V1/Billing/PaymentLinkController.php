<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Billing;

use App\Http\Controllers\Controller;
use App\Services\Billing\PaymentLinkService;
use Illuminate\Http\JsonResponse;

class PaymentLinkController extends Controller
{
    public function __construct(private readonly PaymentLinkService $service) {}

    public function show(string $token): JsonResponse
    {
        return response()->json([
            'success' => true,
            'message' => 'Payment link resolved.',
            'data' => $this->service->publicPayload($token),
            'errors' => null,
        ]);
    }

    public function checkout(string $token): JsonResponse
    {
        $url = $this->service->checkoutFromToken($token);

        return response()->json([
            'success' => true,
            'message' => 'Checkout session created.',
            'data' => ['checkout_url' => $url],
            'errors' => null,
        ]);
    }
}
