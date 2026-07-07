<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Internal;

use App\Http\Controllers\Controller;
use App\Http\Requests\Internal\InternalLoginRequest;
use App\Http\Resources\UserResource;
use App\Services\Internal\InternalAuthService;
use App\Support\LoginRateLimiter;
use Illuminate\Http\JsonResponse;

class InternalLoginController extends Controller
{
    public function __construct(private readonly InternalAuthService $authService) {}

    /**
     * @deprecated Use /api/v1/agent/login.
     *
     * Legacy endpoint kept for backward compatibility and accepts only agents.
     */
    public function __invoke(InternalLoginRequest $request): JsonResponse
    {
        $result = $this->authService->login(
            email: $request->validated('email'),
            password: $request->validated('password'),
        );

        if (! $result) {
            LoginRateLimiter::recordFailedAttempt($request);

            return $this->error(
                message: 'Invalid credentials or onboarding not completed.',
                errors: ['email' => ['Credentials are invalid, role is not permitted for this endpoint, or onboarding is not complete.']],
                status: 401,
            );
        }

        LoginRateLimiter::clear($request);

        return $this->success(
            message: 'Login successful.',
            data: [
                'token' => $result['token'],
                'token_type' => 'Bearer',
                'dashboard_path' => '/agent/dashboard',
                'internal_role' => $result['internal_role'],
                'access_role' => $result['access_role'],
                'user' => new UserResource($result['user']),
            ],
        );
    }
}
