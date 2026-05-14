<?php

declare(strict_types=1);

namespace App\Services\Payroll;

use App\Models\User;
use App\Services\Company\CompanyContextService;
use Illuminate\Validation\ValidationException;

class PayrollAccessService
{
    public function __construct(private readonly CompanyContextService $companyContextService) {}

    public function resolve(User $user, ?int $companyId = null): PayrollAccessContext
    {
        $context = $this->companyContextService->resolve($user, $companyId);

        return new PayrollAccessContext(
            company: $context['company'],
            role: $context['role'],
        );
    }

    public function ensureCanManage(PayrollAccessContext $context): void
    {
        if (! $context->canManagePayroll()) {
            throw ValidationException::withMessages([
                'authorization' => ['Only owners, admins, and supervisors can manage payroll settings.'],
            ]);
        }
    }

    public function ensureCanView(PayrollAccessContext $context): void
    {
        if (! $context->canViewPayroll()) {
            throw ValidationException::withMessages([
                'authorization' => ['You are not allowed to view payroll settings.'],
            ]);
        }
    }
}
