<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\User;
use App\Support\UserAccountStatus;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureUserAccountIsActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user instanceof User) {
            return $next($request);
        }

        UserAccountStatus::liftExpiredSuspensionIfNeeded($user);

        $block = UserAccountStatus::resolveBlock($user);

        if ($block === null) {
            return $next($request);
        }

        $user->currentAccessToken()?->delete();

        return $this->blockedResponse(
            message: $block['message'],
            accountStatus: $block['code'],
            suspendedUntil: $block['suspended_until'],
        );
    }

    public static function blockedResponse(
        string $message,
        string $accountStatus,
        ?\Carbon\CarbonInterface $suspendedUntil = null,
    ): JsonResponse {
        return response()->json([
            'success' => false,
            'message' => $message,
            'data' => [
                'account_status' => $accountStatus,
                'suspended_until' => $suspendedUntil?->toIso8601String(),
            ],
            'errors' => null,
            'code' => $accountStatus,
        ], 403);
    }
}
