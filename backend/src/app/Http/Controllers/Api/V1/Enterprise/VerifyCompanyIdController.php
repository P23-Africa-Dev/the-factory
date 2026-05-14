<?php

namespace App\Http\Controllers\Api\V1\Enterprise;

use App\Http\Controllers\Controller;
use App\Http\Requests\Enterprise\VerifyCompanyIdRequest;
use App\Services\Enterprise\FirstTimeOnboardingService;
use Illuminate\Http\JsonResponse;

class VerifyCompanyIdController extends Controller
{
    public function __construct(private readonly FirstTimeOnboardingService $firstTimeOnboardingService) {}

    public function __invoke(VerifyCompanyIdRequest $request): JsonResponse
    {
        $payload = $this->firstTimeOnboardingService->verifyCompanyId(
            requestId: (int) $request->validated('request_id'),
            token: $request->validated('token'),
            companyId: $request->validated('company_id'),
        );

        return $this->success(
            message: 'Company ID verified successfully.',
            data: $payload,
        );
    }
}
