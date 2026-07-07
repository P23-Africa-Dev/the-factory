<?php

declare(strict_types=1);

namespace App\Services\Drive;

use App\Models\Company;

class DriveAccessContext
{
    public function __construct(
        public readonly Company $company,
        public readonly string $role,
        public readonly int $userId,
    ) {}

    public function isManagement(): bool
    {
        return in_array($this->role, ['owner', 'admin', 'supervisor'], true);
    }

    public function isAgent(): bool
    {
        return $this->role === 'agent';
    }

    public function canManageDrive(): bool
    {
        return $this->isManagement();
    }
}
