<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Enums\VerificationType;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ResendOtpRequest;
use App\Models\User;
use App\Notifications\OtpNotification;
use App\Services\Auth\OtpService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;
use Throwable;

class ResendOtpController extends Controller
{
    public function __construct(private readonly OtpService $otpService) {}

    public function __invoke(ResendOtpRequest $request): JsonResponse
    {
        $email = $request->validated('email');

        if ($this->otpService->isWithinCooldown($email, VerificationType::REGISTRATION->value)) {
            return $this->error(
                message: 'Please wait before requesting another code.',
                errors: ['email' => ['A verification code was recently sent. Please wait 60 seconds before trying again.']],
                status: 429,
            );
        }

        /** @var User $user */
        $user = User::where('email', $email)->firstOrFail();

        $otp = $this->otpService->generate(
            email: $email,
            type: VerificationType::REGISTRATION->value,
            ipAddress: $request->ip(),
        );

        try {
            $user->notify(new OtpNotification($otp, VerificationType::REGISTRATION->value));

            Log::info('OTP resend delivery succeeded.', [
                'email' => $email,
                'user_id' => $user->id,
                'verification_type' => VerificationType::REGISTRATION->value,
                'ip' => $request->ip(),
            ]);
        } catch (Throwable $e) {
            $this->otpService->invalidateLatestUnused($email, VerificationType::REGISTRATION->value);

            Log::error('OTP resend delivery failed.', [
                'email' => $email,
                'user_id' => $user->id,
                'verification_type' => VerificationType::REGISTRATION->value,
                'ip' => $request->ip(),
                'exception' => $e::class,
                'message' => $e->getMessage(),
            ]);

            return $this->error(
                message: 'Unable to deliver verification code right now. Please try again shortly.',
                errors: ['email' => ["Delivery failed for {$email}."]],
                status: 503,
            );
        }

        return $this->success(
            message: 'A new verification code has been sent to your email.',
            data: [
                'email' => $this->maskEmail($email),
            ],
        );
    }
}
