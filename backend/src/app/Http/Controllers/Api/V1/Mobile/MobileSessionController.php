<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Mobile;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Services\Mobile\MobileAuthService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MobileSessionController extends Controller
{
    public function __construct(private readonly MobileAuthService $authService) {}

    /**
     * Revalidate the current mobile session, returning mode and permission metadata.
     */
    public function __invoke(Request $request): JsonResponse
    {
        $user = $request->user();

        if (! $user) {
            return $this->error(
                message: 'Unauthenticated.',
                status: 401,
            );
        }

        $session = $this->authService->resolveSession($user);

        return $this->success(
            message: 'Session valid.',
            data: [
                'app_mode' => $session['app_mode'],
                'home_path' => $session['home_path'],
                'user_type' => $session['user_type'],
                'access_role' => $session['access_role'],
                'internal_role' => $session['internal_role'],
                'companies' => $session['companies'],
                'user' => new UserResource($user),
            ],
        );
    }
}

