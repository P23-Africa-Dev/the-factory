<?php

declare(strict_types=1);

namespace App\Services\Payroll;

use App\Models\Company;

class PayrollAccessContext
{
    public function __construct(
        public readonly Company $company,
        public readonly string $role,
    ) {}

    public function canManagePayroll(): bool
    {
        return in_array($this->role, ['owner', 'admin', 'supervisor'], true);
    }

    public function canViewPayroll(): bool
    {
        return in_array($this->role, ['owner', 'admin', 'supervisor', 'agent'], true);
    }
}
