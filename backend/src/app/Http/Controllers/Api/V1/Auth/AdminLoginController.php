<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\AdminLoginRequest;
use App\Http\Resources\UserResource;
use App\Services\Auth\AdminAuthService;
use Illuminate\Http\JsonResponse;

class AdminLoginController extends Controller
{
    public function __construct(private readonly AdminAuthService $adminAuthService) {}

    /**
     * Shared login endpoint for admin and supervisor users.
     */
    public function __invoke(AdminLoginRequest $request): JsonResponse
    {
        $result = $this->adminAuthService->login(
            email: $request->validated('email'),
            password: $request->validated('password'),
        );

        if (! $result) {
            return $this->error(
                message: 'Invalid credentials or account not activated.',
                errors: ['email' => ['Credentials are invalid, role is not permitted for this endpoint, or onboarding is not complete.']],
                status: 401,
            );
        }

        return $this->success(
            message: 'Login successful.',
            data: [
                'token' => $result['token'],
                'token_type' => 'Bearer',
                'dashboard_path' => '/dashboard',
                'user_type' => $result['user_type'],
                'access_role' => $result['access_role'],
                'internal_role' => $result['internal_role'],
                'user' => new UserResource($result['user']),
            ],
        );
    }
}
