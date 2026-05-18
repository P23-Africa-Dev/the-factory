<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ForgotPasswordRequest;
use App\Services\Auth\PasswordResetService;
use Illuminate\Http\JsonResponse;

class ForgotPasswordController extends Controller
{
    public function __construct(private readonly PasswordResetService $passwordResetService) {}

    public function __invoke(ForgotPasswordRequest $request): JsonResponse
    {
        $sent = $this->passwordResetService->sendResetCode(
            email: $request->validated('email'),
            ipAddress: $request->ip(),
        );

        if (! $sent) {
            return $this->error(
                message: 'Unable to deliver password reset code right now. Please try again shortly.',
                errors: ['email' => ['A reset code was recently sent or delivery failed.']],
                status: 503,
            );
        }

        return $this->success(
            message: 'If the email exists, a password reset code has been sent.',
            data: [
                'email' => $this->maskEmail($request->validated('email')),
            ],
        );
    }
}
