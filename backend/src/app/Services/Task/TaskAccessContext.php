<?php

declare(strict_types=1);

namespace App\Services\Task;

use App\Models\Company;

class TaskAccessContext
{
    public function __construct(
        public readonly Company $company,
        public readonly string $role,
    ) {}

    public function canManageTasks(): bool
    {
        return in_array($this->role, ['owner', 'admin', 'supervisor'], true);
    }

    public function canViewProofFiles(): bool
    {
        return in_array($this->role, ['owner', 'admin'], true);
    }

    public function isAgent(): bool
    {
        return $this->role === 'agent';
    }
}
