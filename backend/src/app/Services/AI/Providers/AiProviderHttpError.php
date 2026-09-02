<?php

declare(strict_types=1);

namespace App\Services\AI\Providers;

final class AiProviderHttpError
{
    /**
     * @return array{error_class: string, error_message: string}
     */
    public static function classify(int $httpStatus, string $bodyMessage = ''): array
    {
        $message = trim($bodyMessage);

        if ($httpStatus === 401) {
            return ['error_class' => 'auth_failed', 'error_message' => $message !== '' ? $message : 'Invalid API key.'];
        }

        if ($httpStatus === 402) {
            return ['error_class' => 'quota_exceeded', 'error_message' => $message !== '' ? $message : 'Billing limit reached.'];
        }

        if ($httpStatus === 429) {
            return ['error_class' => 'rate_limited', 'error_message' => $message !== '' ? $message : 'Rate limit exceeded.'];
        }

        if ($httpStatus === 404) {
            return ['error_class' => 'model_not_found', 'error_message' => $message !== '' ? $message : 'Model not found.'];
        }

        if ($httpStatus === 400) {
            $lower = strtolower($message);
            if (str_contains($lower, 'credit') || str_contains($lower, 'billing') || str_contains($lower, 'balance')) {
                return ['error_class' => 'quota_exceeded', 'error_message' => $message];
            }
        }

        if ($httpStatus >= 500) {
            return ['error_class' => 'provider_error', 'error_message' => $message !== '' ? $message : 'Provider server error.'];
        }

        return [
            'error_class' => 'error',
            'error_message' => $message !== '' ? $message : 'HTTP ' . $httpStatus,
        ];
    }
}
