<?php

declare(strict_types=1);

namespace App\Services\Internal;

use App\Models\Company;
use App\Models\User;
use App\Services\Company\CompanyContextService;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class InternalUserAccessService
{
    public const ACTION_EDIT = 'edit';

    public const ACTION_SUSPEND = 'suspend';

    public const ACTION_DELETE = 'delete';

    public const ACTION_REACTIVATE = 'reactivate';

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

    /**
     * @return array{supervisor_can_suspend_agents: bool, supervisor_can_delete_agents: bool}
     */
    public function userManagementSettings(Company $company): array
    {
        $settings = is_array($company->settings) ? $company->settings : [];
        $userManagement = is_array($settings['user_management'] ?? null) ? $settings['user_management'] : [];

        return [
            'supervisor_can_suspend_agents' => (bool) ($userManagement['supervisor_can_suspend_agents'] ?? false),
            'supervisor_can_delete_agents' => (bool) ($userManagement['supervisor_can_delete_agents'] ?? false),
        ];
    }

    public function ensureCanActOnTarget(
        User $actor,
        string $actorRole,
        User $target,
        string $action,
        Company $company,
    ): void {
        if ($actor->id === $target->id) {
            throw ValidationException::withMessages([
                'authorization' => ['You cannot perform this action on your own account.'],
            ]);
        }

        $targetRole = $this->resolveTargetCompanyRole($target, $company);

        if ($targetRole === 'owner') {
            throw ValidationException::withMessages([
                'authorization' => ['You are not allowed to manage the company owner.'],
            ]);
        }

        if (in_array($actorRole, ['owner', 'admin'], true)) {
            if (! in_array($targetRole, ['admin', 'supervisor', 'agent'], true)) {
                throw ValidationException::withMessages([
                    'authorization' => ['You are not allowed to manage this user.'],
                ]);
            }

            return;
        }

        if ($actorRole !== 'supervisor') {
            throw ValidationException::withMessages([
                'authorization' => ['You are not allowed to manage supervisors or agents.'],
            ]);
        }

        if ($target->internal_role !== 'agent' || (int) $target->supervisor_user_id !== (int) $actor->id) {
            throw ValidationException::withMessages([
                'authorization' => ['You can only manage agents assigned to you.'],
            ]);
        }

        if ($action === self::ACTION_EDIT) {
            return;
        }

        $privileges = $this->userManagementSettings($company);

        if ($action === self::ACTION_SUSPEND || $action === self::ACTION_REACTIVATE) {
            if (! $privileges['supervisor_can_suspend_agents']) {
                throw ValidationException::withMessages([
                    'authorization' => ['Your account does not have permission to suspend agents.'],
                ]);
            }

            return;
        }

        if ($action === self::ACTION_DELETE) {
            if (! $privileges['supervisor_can_delete_agents']) {
                throw ValidationException::withMessages([
                    'authorization' => ['Your account does not have permission to delete agents.'],
                ]);
            }

            return;
        }

        throw ValidationException::withMessages([
            'authorization' => ['You are not allowed to perform this action.'],
        ]);
    }

    public function ensureCanChangeRole(string $actorRole, ?string $newRole): void
    {
        if ($newRole === null) {
            return;
        }

        if (in_array($newRole, ['admin', 'supervisor'], true) && ! in_array($actorRole, ['owner', 'admin'], true)) {
            throw ValidationException::withMessages([
                'role' => ['Only owners and admins can assign admin or supervisor roles.'],
            ]);
        }
    }

    public function ensureCanViewAuditLogs(string $actorRole): void
    {
        if (! in_array($actorRole, ['owner', 'admin'], true)) {
            throw ValidationException::withMessages([
                'authorization' => ['You are not allowed to view user management audit logs.'],
            ]);
        }
    }

    public function ensureCanManageUserManagementSettings(string $actorRole): void
    {
        if (! in_array($actorRole, ['owner', 'admin'], true)) {
            throw ValidationException::withMessages([
                'authorization' => ['Only owners and admins can update user management settings.'],
            ]);
        }
    }

    private function resolveTargetCompanyRole(User $target, Company $company): ?string
    {
        $role = DB::table('company_users')
            ->where('company_id', $company->id)
            ->where('user_id', $target->id)
            ->value('role');

        return $role !== null ? (string) $role : null;
    }
}
