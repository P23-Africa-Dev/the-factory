<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use App\Services\Security\SecurityAuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LogoutController extends Controller
{
    public function __construct(
        private readonly SecurityAuditLogger $securityAudit,
    ) {}

    public function __invoke(Request $request): JsonResponse
    {
        $user = $request->user();
        $tokenName = $user?->currentAccessToken()?->name;
        $channel = match ($tokenName) {
            'admin_auth_token' => SecurityAuditLogger::CHANNEL_ADMIN_API,
            'agent_auth_token' => SecurityAuditLogger::CHANNEL_AGENT_API,
            default => SecurityAuditLogger::CHANNEL_API,
        };

        $this->securityAudit->logout($user, $channel);
        $user?->currentAccessToken()?->delete();

        return $this->success(
            message: 'Logged out successfully.',
        );
    }
}
