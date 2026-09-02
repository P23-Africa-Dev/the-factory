<?php

namespace App\Http\Controllers\Api\V1\Enterprise;

use App\Http\Controllers\Controller;
use App\Http\Requests\Enterprise\EnterpriseLoginRequest;
use App\Http\Resources\UserResource;
use App\Services\Enterprise\EnterpriseAuthService;
use App\Support\LoginRateLimiter;
use Illuminate\Http\JsonResponse;

class EnterpriseLoginController extends Controller
{
    public function __construct(private readonly EnterpriseAuthService $enterpriseAuthService) {}

    public function __invoke(EnterpriseLoginRequest $request): JsonResponse
    {
        $result = $this->enterpriseAuthService->login(
            email: $request->validated('email'),
            password: $request->validated('password'),
        );

        if (! $result) {
            LoginRateLimiter::recordFailedAttempt($request);

            return $this->error(
                message: 'Invalid credentials or account not activated.',
                errors: ['email' => ['Credentials are invalid or onboarding is not complete.']],
                status: 401,
            );
        }

        LoginRateLimiter::clear($request);

        return $this->success(
            message: 'Login successful.',
            data: [
                'token' => $result['token'],
                'token_type' => 'Bearer',
                'user' => new UserResource($result['user']),
            ],
        );
    }
}
