<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ResetPasswordRequest;
use App\Services\Auth\PasswordResetService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ResetPasswordController extends Controller
{
    public function __construct(private readonly PasswordResetService $passwordResetService) {}

    public function validateToken(Request $request, string $token): JsonResponse
    {
        $email = trim((string) $request->query('email', ''));
        $portal = trim((string) $request->query('portal', ''));

        if ($email === '') {
            return $this->error(
                message: 'Email is required to validate the reset link.',
                errors: ['email' => ['Email address is required.']],
                status: 422,
            );
        }

        $valid = $this->passwordResetService->validateToken(
            email: $email,
            token: $token,
            portal: $portal !== '' ? $portal : null,
        );

        if (! $valid) {
            return $this->error(
                message: 'This password reset link is invalid or has expired.',
                errors: ['token' => ['The password reset link is invalid, expired, or already used.']],
                status: 422,
            );
        }

        return $this->success(
            message: 'Password reset link is valid.',
            data: ['valid' => true],
        );
    }

    public function reset(ResetPasswordRequest $request): JsonResponse
    {
        $effectivePortal = $this->passwordResetService->resetPassword(
            email: $request->validated('email'),
            token: $request->validated('token'),
            password: $request->validated('password'),
            portal: $request->validated('portal'),
        );

        if ($effectivePortal === null) {
            return $this->error(
                message: 'The reset link is invalid or expired.',
                errors: ['token' => ['The reset link is invalid, expired, or already used.']],
                status: 422,
            );
        }

        return $this->success(
            message: 'Password reset successfully.',
            data: [
                'redirect_path' => $this->passwordResetService->loginPathForPortal($effectivePortal),
            ],
        );
    }
}
