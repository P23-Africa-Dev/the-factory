<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ResetPasswordRequest;
use App\Services\Auth\PasswordResetService;
use Illuminate\Http\JsonResponse;

class ResetPasswordController extends Controller
{
    public function __construct(private readonly PasswordResetService $passwordResetService) {}

    public function __invoke(ResetPasswordRequest $request): JsonResponse
    {
        $updated = $this->passwordResetService->resetPassword(
            email: $request->validated('email'),
            otp: $request->validated('otp'),
            password: $request->validated('password'),
        );

        if (! $updated) {
            return $this->error(
                message: 'The reset code is invalid or expired.',
                errors: ['otp' => ['The reset code is invalid, expired, or already used.']],
                status: 422,
            );
        }

        return $this->success(
            message: 'Password reset successfully.',
        );
    }
}
