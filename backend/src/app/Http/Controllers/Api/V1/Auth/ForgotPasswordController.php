<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ForgotPasswordRequest;
use App\Services\Auth\PasswordResetService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;

class ForgotPasswordController extends Controller
{
    public function __construct(private readonly PasswordResetService $passwordResetService) {}

    public function __invoke(ForgotPasswordRequest $request): JsonResponse
    {
        $delivered = $this->passwordResetService->sendResetLink(
            email: $request->validated('email'),
            portal: $request->validated('portal'),
            ipAddress: $request->ip(),
        );

        if (! $delivered) {
            Log::warning('Password reset email delivery failed after account lookup.', [
                'email' => $request->validated('email'),
                'portal' => $request->validated('portal'),
                'ip' => $request->ip(),
            ]);
        }

        return $this->success(
            message: 'If an account exists with this email, a password reset link has been sent.',
            data: null,
        );
    }
}
