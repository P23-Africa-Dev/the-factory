<?php

declare(strict_types=1);

namespace App\Exceptions;

use Carbon\CarbonInterface;
use Exception;

class AccountAccessDeniedException extends Exception
{
    public function __construct(
        string $message,
        private readonly string $accountStatus,
        private readonly ?CarbonInterface $suspendedUntil = null,
    ) {
        parent::__construct($message);
    }

    public function accountStatus(): string
    {
        return $this->accountStatus;
    }

    public function suspendedUntil(): ?CarbonInterface
    {
        return $this->suspendedUntil;
    }
}
