<?php

declare(strict_types=1);

namespace App\Services\Attendance;

use App\Models\User;
use App\Services\Company\CompanyContextService;
use Illuminate\Validation\ValidationException;

class AttendanceAccessService
{
    public function __construct(private readonly CompanyContextService $companyContextService) {}

    public function resolve(User $user, ?int $companyId = null): AttendanceAccessContext
    {
        $context = $this->companyContextService->resolve($user, $companyId);

        return new AttendanceAccessContext(
            company: $context['company'],
            role: $context['role'],
        );
    }

    public function ensureCanManage(AttendanceAccessContext $context): void
    {
        if (! $context->canManageAttendance()) {
            throw ValidationException::withMessages([
                'authorization' => ['Only owners, admins, and supervisors can manage attendance settings.'],
            ]);
        }
    }

    public function ensureAgent(AttendanceAccessContext $context): void
    {
        if (! $context->isAgent()) {
            throw ValidationException::withMessages([
                'authorization' => ['Only agents can manage personal attendance actions.'],
            ]);
        }
    }
}
