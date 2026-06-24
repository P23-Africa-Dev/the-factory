<?php

declare(strict_types=1);

namespace App\Services\Kpi;

use App\Models\Company;

class KpiAccessContext
{
    public function __construct(
        public readonly Company $company,
        public readonly string $role,
    ) {}

    public function canManageKpis(): bool
    {
        return in_array($this->role, ['owner', 'admin', 'supervisor'], true);
    }

    public function isAgent(): bool
    {
        return $this->role === 'agent';
    }
}
