<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Agent;

use App\Http\Controllers\Controller;
use App\Http\Requests\Agent\AgentLoginRequest;
use App\Http\Resources\InternalUserResource;
use App\Services\Agent\AgentAuthService;
use Illuminate\Http\JsonResponse;

class AgentLoginController extends Controller
{
    public function __construct(private readonly AgentAuthService $authService) {}

    /**
     * Agent-only login endpoint.
     */
    public function __invoke(AgentLoginRequest $request): JsonResponse
    {
        $result = $this->authService->login(
            email: $request->validated('email'),
            password: $request->validated('password'),
        );

        if (! $result) {
            return $this->error(
                message: 'Invalid credentials or onboarding not completed.',
                errors: ['email' => ['Credentials are invalid or onboarding is not complete.']],
                status: 401,
            );
        }

        return $this->success(
            message: 'Login successful.',
            data: [
                'token' => $result['token'],
                'token_type' => 'Bearer',
                'dashboard_path' => '/agent/dashboard',
                'internal_role' => $result['internal_role'],
                'access_role' => $result['access_role'],
                'user' => new InternalUserResource($result['user']),
            ],
        );
    }
}
