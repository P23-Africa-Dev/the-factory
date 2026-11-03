<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Mobile;

use App\Http\Controllers\Controller;
use App\Http\Requests\Mobile\MobileLoginRequest;
use App\Http\Resources\UserResource;
use App\Services\Mobile\MobileAuthService;
use App\Support\LoginRateLimiter;
use Illuminate\Http\JsonResponse;

class MobileLoginController extends Controller
{
    public function __construct(private readonly MobileAuthService $authService) {}

    /**
     * Unified mobile login endpoint for agents and managers.
     */
    public function __invoke(MobileLoginRequest $request): JsonResponse
    {
        $result = $this->authService->login(
            email: $request->validated('email'),
            password: $request->validated('password'),
        );

        if (! $result) {
            LoginRateLimiter::recordFailedAttempt($request);

            return $this->error(
                message: 'Invalid credentials or onboarding not completed.',
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
                'app_mode' => $result['app_mode'],
                'home_path' => $result['home_path'],
                'user_type' => $result['user_type'],
                'access_role' => $result['access_role'],
                'internal_role' => $result['internal_role'],
                'companies' => $result['companies'],
                'user' => new UserResource($result['user']),
            ],
        );
    }
}

