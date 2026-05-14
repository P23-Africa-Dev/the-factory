<?php

namespace App\Http\Controllers\Api\V1\Enterprise;

use App\Http\Controllers\Controller;
use App\Http\Requests\Enterprise\CompleteFirstTimeSetupRequest;
use App\Http\Resources\UserResource;
use App\Services\Enterprise\FirstTimeOnboardingService;
use Illuminate\Http\JsonResponse;

class CompleteFirstTimeSetupController extends Controller
{
    public function __construct(private readonly FirstTimeOnboardingService $firstTimeOnboardingService) {}

    public function __invoke(CompleteFirstTimeSetupRequest $request): JsonResponse
    {
        $result = $this->firstTimeOnboardingService->completeSetup(
            requestId: (int) $request->validated('request_id'),
            token: $request->validated('token'),
            companyId: $request->validated('company_id'),
            password: $request->validated('password'),
        );

        return $this->success(
            message: 'Account setup completed successfully.',
            data: [
                'token' => $result['token'],
                'token_type' => 'Bearer',
                'user' => new UserResource($result['user']),
            ],
        );
    }
}
