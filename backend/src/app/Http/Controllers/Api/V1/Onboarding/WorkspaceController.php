<?php

namespace App\Http\Controllers\Api\V1\Onboarding;

use App\Http\Controllers\Controller;
use App\Http\Requests\Onboarding\CreateWorkspaceRequest;
use App\Http\Resources\UserResource;
use App\Http\Resources\WorkspaceResource;
use App\Services\Onboarding\WorkspaceService;
use Illuminate\Http\JsonResponse;

class WorkspaceController extends Controller
{
    public function __construct(private readonly WorkspaceService $workspaceService) {}

    public function store(CreateWorkspaceRequest $request): JsonResponse
    {
        $user = $request->user();
        $currentToken = $user?->currentAccessToken();

        if ($user->hasCompletedOnboarding()) {
            return $this->error(
                message: 'Onboarding has already been completed.',
                errors: null,
                status: 409,
            );
        }

        $workspace = $this->workspaceService->create($user, $request->validated());

        $newAccessToken = $user->createToken(
            name: 'onboarding_auth_token',
            abilities: ['*'],
            expiresAt: now()->addDays(30),
        );

        if ($currentToken) {
            $currentToken->delete();
        }

        $freshUser = $user->fresh();

        return $this->success(
            message: 'Workspace created successfully. Welcome aboard!',
            data: [
                'token' => $newAccessToken->plainTextToken,
                'token_type' => 'Bearer',
                'workspace' => new WorkspaceResource($workspace),
                'user' => new UserResource($freshUser),
                'onboarding_completed' => $freshUser->hasCompletedOnboarding(),
            ],
            status: 201,
        );
    }
}
