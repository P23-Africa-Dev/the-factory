<?php

declare(strict_types=1);

namespace App\Exceptions;

use Exception;
use Illuminate\Http\JsonResponse;
use Throwable;

class OtpDeliveryException extends Exception
{
    public function __construct(
        string $message = 'Unable to deliver verification code right now. Please try again shortly.',
        private readonly ?string $email = null,
        ?Throwable $previous = null,
    ) {
        parent::__construct($message, 0, $previous);
    }

    public function render(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => $this->message,
            'data' => null,
            'errors' => [
                'email' => [$this->email ? "Delivery failed for {$this->email}." : 'OTP delivery failed.'],
            ],
        ], 503);
    }
}
