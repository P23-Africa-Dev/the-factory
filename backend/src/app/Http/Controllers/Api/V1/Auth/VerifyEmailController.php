<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\VerifyEmailRequest;
use App\Http\Resources\UserResource;
use App\Services\Auth\RegisterService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;
use Throwable;

class VerifyEmailController extends Controller
{
    public function __construct(private readonly RegisterService $registerService) {}

    public function __invoke(VerifyEmailRequest $request): JsonResponse
    {
        $email = $request->validated('email');

        try {
            $result = $this->registerService->verifyAndAuthenticate(
                email: $email,
                otp: $request->validated('otp_code'),
            );
        } catch (Throwable $e) {
            Log::error('Unexpected error while verifying OTP.', [
                'email' => $email,
                'ip' => $request->ip(),
                'exception' => $e::class,
                'message' => $e->getMessage(),
            ]);

            return $this->error(
                message: 'Unable to complete email verification right now. Please try again.',
                errors: ['otp_code' => ['Verification could not be completed due to a temporary server issue.']],
                status: 503,
            );
        }

        if ($result === null) {
            return $this->error(
                message: 'Invalid or expired verification code.',
                errors: ['otp_code' => ['The verification code is incorrect or has expired. Please request a new one.']],
                status: 422,
            );
        }

        $user = $result['user'];
        $onboardingCompleted = $user->hasCompletedOnboarding()
            || $user->hasCompletedEnterpriseOnboarding()
            || $user->hasCompletedInternalOnboarding();

        return $this->success(
            message: 'Email verified successfully. Welcome to The Factory!',
            data: [
                'token' => $result['token'],
                'token_type' => 'Bearer',
                'expires_in_days' => 30,
                'user' => new UserResource($user),
                'onboarding_completed' => $onboardingCompleted,
            ],
        );
    }
}
