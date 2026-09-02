<?php

declare(strict_types=1);

namespace App\Services\AI\Providers;

final readonly class AiGenerationResult
{
    public function __construct(
        public ?string $text,
        public string $provider,
        public string $model,
        public string $purpose = 'default',
        public ?int $inputTokens = null,
        public ?int $outputTokens = null,
        public ?string $failoverFrom = null,
        public ?string $errorClass = null,
        public ?string $errorMessage = null,
        public ?int $httpStatus = null,
    ) {}

    public function isSuccessful(): bool
    {
        return is_string($this->text) && trim($this->text) !== '';
    }

    public function isFailure(): bool
    {
        return $this->errorClass !== null && $this->errorClass !== '';
    }

    public static function failure(
        string $provider,
        string $model,
        string $errorClass,
        string $errorMessage,
        ?int $httpStatus = null,
        string $purpose = 'default',
    ): self {
        return new self(
            text: null,
            provider: $provider,
            model: $model,
            purpose: $purpose,
            errorClass: $errorClass,
            errorMessage: $errorMessage,
            httpStatus: $httpStatus,
        );
    }

    public function withFailoverFrom(?string $failoverFrom): self
    {
        return new self(
            text: $this->text,
            provider: $this->provider,
            model: $this->model,
            purpose: $this->purpose,
            inputTokens: $this->inputTokens,
            outputTokens: $this->outputTokens,
            failoverFrom: $failoverFrom,
            errorClass: $this->errorClass,
            errorMessage: $this->errorMessage,
            httpStatus: $this->httpStatus,
        );
    }

    public function withPurpose(string $purpose): self
    {
        return new self(
            text: $this->text,
            provider: $this->provider,
            model: $this->model,
            purpose: $purpose,
            inputTokens: $this->inputTokens,
            outputTokens: $this->outputTokens,
            failoverFrom: $this->failoverFrom,
            errorClass: $this->errorClass,
            errorMessage: $this->errorMessage,
            httpStatus: $this->httpStatus,
        );
    }
}
