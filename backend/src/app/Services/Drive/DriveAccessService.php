<?php

declare(strict_types=1);

namespace App\Services\Drive;

use App\Models\User;
use App\Services\Company\CompanyContextService;
use Illuminate\Validation\ValidationException;

class DriveAccessService
{
    public function __construct(private readonly CompanyContextService $companyContextService) {}

    public function resolve(User $user, ?int $companyId = null): DriveAccessContext
    {
        $context = $this->companyContextService->resolve($user, $companyId);

        return new DriveAccessContext(
            company: $context['company'],
            role: $context['role'],
            userId: (int) $user->id,
        );
    }

    public function ensureCanManage(DriveAccessContext $context): void
    {
        if (! $context->canManageDrive()) {
            throw ValidationException::withMessages([
                'authorization' => ['Only owners, admins, and supervisors can manage company drive.'],
            ]);
        }
    }
}
