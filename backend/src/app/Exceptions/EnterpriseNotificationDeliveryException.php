<?php

declare(strict_types=1);

namespace App\Exceptions;

use Exception;
use Illuminate\Http\JsonResponse;
use Throwable;

class EnterpriseNotificationDeliveryException extends Exception
{
    /**
     * @param  array<int, string>  $emails
     */
    public function __construct(
        string $message = 'Unable to deliver enterprise onboarding email right now. Please try again shortly.',
        private readonly array $emails = [],
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
                'email' => $this->emails !== []
                    ? array_map(static fn (string $email): string => "Delivery failed for {$email}.", $this->emails)
                    : ['Enterprise notification delivery failed.'],
            ],
        ], 503);
    }
}