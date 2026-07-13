<?php

declare(strict_types=1);

namespace App\Services\Internal;

use App\Models\Company;
use App\Models\InternalUserAuditLog;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;

class InternalUserLifecycleService
{
    public function __construct(
        private readonly InternalUserAccessService $accessService,
        private readonly InternalUserAuditLogger $auditLogger,
    ) {}

    public function suspend(User $actor, User $target, array $data, ?int $companyId = null): User
    {
        ['company' => $company, 'role' => $actorRole] = $this->accessService->resolveCompanyContext($actor, $companyId);
        $this->accessService->ensureCanManageInternalUsers($actorRole);
        $this->accessService->ensureCanActOnTarget($actor, $actorRole, $target, InternalUserAccessService::ACTION_SUSPEND, $company);

        $until = $this->resolveSuspensionUntil($data);

        $target->update([
            'suspended_until' => $until,
            'is_active' => true,
        ]);

        $target->tokens()->delete();

        $this->auditLogger->log(
            companyId: (int) $company->id,
            actorUserId: (int) $actor->id,
            targetUserId: (int) $target->id,
            action: 'suspended',
            metadata: [
                'suspend_type' => (string) ($data['suspend_type'] ?? 'duration'),
                'suspended_until' => $until->toIso8601String(),
            ],
        );

        return $target->fresh();
    }

    public function reactivate(User $actor, User $target, ?int $companyId = null): User
    {
        ['company' => $company, 'role' => $actorRole] = $this->accessService->resolveCompanyContext($actor, $companyId);
        $this->accessService->ensureCanManageInternalUsers($actorRole);
        $this->accessService->ensureCanActOnTarget($actor, $actorRole, $target, InternalUserAccessService::ACTION_REACTIVATE, $company);

        $target->update([
            'suspended_until' => null,
            'is_active' => true,
            'deactivated_at' => null,
        ]);

        $this->auditLogger->log(
            companyId: (int) $company->id,
            actorUserId: (int) $actor->id,
            targetUserId: (int) $target->id,
            action: 'reactivated',
        );

        return $target->fresh();
    }

    public function delete(User $actor, User $target, ?int $companyId = null): void
    {
        ['company' => $company, 'role' => $actorRole] = $this->accessService->resolveCompanyContext($actor, $companyId);
        $this->accessService->ensureCanManageInternalUsers($actorRole);
        $this->accessService->ensureCanActOnTarget($actor, $actorRole, $target, InternalUserAccessService::ACTION_DELETE, $company);

        DB::transaction(function () use ($actor, $target, $company): void {
            $target->tokens()->delete();
            $target->delete();

            $this->auditLogger->log(
                companyId: (int) $company->id,
                actorUserId: (int) $actor->id,
                targetUserId: (int) $target->id,
                action: 'deleted',
            );
        });
    }

    public function paginateAuditLogs(User $actor, array $filters, ?int $companyId = null): LengthAwarePaginator
    {
        ['company' => $company, 'role' => $actorRole] = $this->accessService->resolveCompanyContext($actor, $companyId);
        $this->accessService->ensureCanViewAuditLogs($actorRole);

        $perPage = max(1, min(100, (int) ($filters['per_page'] ?? 20)));

        return InternalUserAuditLog::query()
            ->where('company_id', $company->id)
            ->with([
                'actor:id,name,email',
                'target:id,name,email,internal_role',
            ])
            ->latest('created_at')
            ->paginate($perPage)
            ->withQueryString();
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function resolveSuspensionUntil(array $data): Carbon
    {
        return match ((string) ($data['suspend_type'] ?? 'duration')) {
            'date' => Carbon::parse((string) $data['suspend_until'])->endOfDay(),
            'permanent' => Carbon::create(2038, 1, 1, 23, 59, 59),
            default => now()->addDays((int) ($data['suspend_days'] ?? 3))->endOfDay(),
        };
    }
}
