<?php

declare(strict_types=1);

namespace App\Services\AI\Agent\Chat;

final class ChatResponse
{
    /**
     * @param  array<int, ToolCall>  $toolCalls
     */
    public function __construct(
        public readonly string $text,
        public readonly array $toolCalls,
        public readonly string $stopReason,
        public readonly string $provider,
        public readonly string $model,
        public readonly ?int $inputTokens = null,
        public readonly ?int $outputTokens = null,
        public readonly ?string $errorClass = null,
        public readonly ?string $errorMessage = null,
        public readonly ?int $httpStatus = null,
    ) {}

    public static function failure(
        string $provider,
        string $model,
        string $errorClass,
        string $errorMessage,
        ?int $httpStatus = null,
    ): self {
        return new self('', [], 'error', $provider, $model, null, null, $errorClass, $errorMessage, $httpStatus);
    }

    public function isFailure(): bool
    {
        return $this->errorClass !== null;
    }

    public function wantsTools(): bool
    {
        return $this->toolCalls !== [];
    }
}
