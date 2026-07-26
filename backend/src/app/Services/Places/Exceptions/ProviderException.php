<?php

declare(strict_types=1);

namespace App\Services\Places\Exceptions;

use RuntimeException;

class ProviderException extends RuntimeException
{
    public function __construct(
        public readonly string $provider,
        public readonly string $reason,
        string $message = '',
        int $code = 0,
        ?\Throwable $previous = null,
    ) {
        parent::__construct($message !== '' ? $message : "{$provider}: {$reason}", $code, $previous);
    }

    public static function timeout(string $provider): self
    {
        return new self($provider, 'timeout', "{$provider} timed out");
    }

    public static function auth(string $provider): self
    {
        return new self($provider, 'auth', "{$provider} authentication failed");
    }

    public static function rateLimited(string $provider): self
    {
        return new self($provider, 'rate_limited', "{$provider} rate limited");
    }

    public static function malformed(string $provider, string $detail = ''): self
    {
        return new self($provider, 'malformed', $detail !== '' ? $detail : "{$provider} returned a malformed response");
    }

    public static function unavailable(string $provider, string $detail = ''): self
    {
        return new self($provider, 'unavailable', $detail !== '' ? $detail : "{$provider} unavailable");
    }
}
