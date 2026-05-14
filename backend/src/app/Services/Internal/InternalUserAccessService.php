<?php

declare(strict_types=1);

namespace App\Services\Internal;

use App\Models\User;
use App\Services\Company\CompanyContextService;
use Illuminate\Validation\ValidationException;

class InternalUserAccessService
{
    public function __construct(private readonly CompanyContextService $companyContextService) {}

    public function resolveCompanyContext(User $user, ?int $companyId = null): array
    {
        return $this->companyContextService->resolve($user, $companyId);
    }

    public function ensureCanManageInternalUsers(string $role): void
    {
        if (! in_array($role, ['owner', 'admin', 'supervisor'], true)) {
            throw ValidationException::withMessages([
                'authorization' => ['You are not allowed to manage supervisors or agents.'],
            ]);
        }
    }
}
