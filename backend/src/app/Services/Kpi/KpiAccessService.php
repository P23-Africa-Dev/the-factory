<?php

declare(strict_types=1);

namespace App\Services\Kpi;

use App\Models\User;
use App\Services\Company\CompanyContextService;
use Illuminate\Validation\ValidationException;

class KpiAccessService
{
    public function __construct(private readonly CompanyContextService $companyContextService) {}

    public function resolve(User $user, ?int $companyId = null): KpiAccessContext
    {
        $context = $this->companyContextService->resolve($user, $companyId);

        return new KpiAccessContext(
            company: $context['company'],
            role: $context['role'],
        );
    }

    public function ensureManager(KpiAccessContext $context): void
    {
        if (! $context->canManageKpis()) {
            throw ValidationException::withMessages([
                'authorization' => ['Only owners, admins, and supervisors can manage KPIs.'],
            ]);
        }
    }

    public function ensureAgent(KpiAccessContext $context): void
    {
        if (! $context->isAgent()) {
            throw ValidationException::withMessages([
                'authorization' => ['Only agents can perform this action.'],
            ]);
        }
    }
}
