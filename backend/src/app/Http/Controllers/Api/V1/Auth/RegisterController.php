<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Exceptions\OtpDeliveryException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\RegisterRequest;
use App\Services\Auth\RegisterService;
use Illuminate\Http\JsonResponse;

class RegisterController extends Controller
{
    public function __construct(private readonly RegisterService $registerService) {}

    public function __invoke(RegisterRequest $request): JsonResponse
    {
        $email = $request->validated('email');

        try {
            $this->registerService->initiateRegistration(
                name: $request->validated('name'),
                email: $email,
                password: $request->validated('password'),
                request: $request,
            );
        } catch (OtpDeliveryException $e) {
            return $this->error(
                message: $e->getMessage(),
                errors: ['email' => ["Delivery failed for {$email}."]],
                status: 503,
            );
        }

        return $this->success(
            message: 'Verification code sent. Please check your email.',
            data: [
                'email' => $this->maskEmail($email),
            ],
            status: 201,
        );
    }
}
