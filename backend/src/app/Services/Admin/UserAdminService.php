<?php

namespace App\Services\Admin;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

class UserAdminService
{
    /**
     * Account Owners: all users without an internal_role.
     * Includes self-serve and enterprise owners, plus pending (not-yet-onboarded) accounts.
     */
    public function paginateAccountOwners(array $filters): LengthAwarePaginator
    {
        $query = User::query()
            ->select(['id', 'name', 'email', 'is_active', 'suspended_until',
                'onboarding_completed_at', 'enterprise_onboarding_completed_at', 'created_at'])
            ->whereNull('internal_role')
            ->with([
                'companies'      => fn ($q) => $q->select('companies.id', 'companies.name', 'companies.company_id'),
                'ownedWorkspaces' => fn ($q) => $q->select('id', 'name', 'owner_id'),
            ]);

        $accountType = strtolower(trim((string) ($filters['account_type'] ?? '')));
        if ($accountType === 'enterprise') {
            $query->whereNotNull('enterprise_onboarding_completed_at');
        } elseif ($accountType === 'self_serve') {
            $query->whereNotNull('onboarding_completed_at')
                ->whereNull('enterprise_onboarding_completed_at');
        }

        $this->applyStatusFilter($query, $this->normalizeStatus((string) ($filters['status'] ?? '')));
        $this->applySearch($query, (string) ($filters['search'] ?? ''));

        return $query->latest()->paginate(config('admin.users_per_page'))->withQueryString();
    }

    /**
     * Internal Users: supervisors, agents, and managers created within accounts.
     */
    public function paginateInternalUsers(array $filters): LengthAwarePaginator
    {
        $query = User::query()
            ->select(['id', 'name', 'email', 'is_active', 'suspended_until',
                'internal_role', 'supervisor_user_id', 'created_at'])
            ->whereNotNull('internal_role')
            ->with([
                'supervisor' => fn ($q) => $q->select('id', 'name', 'email'),
                'companies'  => fn ($q) => $q->select('companies.id', 'companies.name', 'companies.company_id'),
            ]);

        $role = strtolower(trim((string) ($filters['role'] ?? '')));
        if (in_array($role, ['supervisor', 'agent', 'manager'], true)) {
            $query->where('internal_role', $role);
        }

        $this->applyStatusFilter($query, $this->normalizeStatus((string) ($filters['status'] ?? '')));
        $this->applySearch($query, (string) ($filters['search'] ?? ''));

        return $query->latest()->paginate(config('admin.users_per_page'))->withQueryString();
    }

    /**
     * Legacy flat listing (kept for backward compatibility).
     */
    public function paginateForAdmin(array $filters): LengthAwarePaginator
    {
        $query = User::query()->select([
            'id', 'name', 'email', 'is_active', 'suspended_until',
            'email_verified_at', 'onboarding_completed_at', 'internal_role', 'created_at',
        ]);

        $this->applyStatusFilter($query, $this->normalizeStatus((string) ($filters['status'] ?? '')));
        $this->applySearch($query, (string) ($filters['search'] ?? ''));

        return $query->latest()->paginate(config('admin.users_per_page'))->withQueryString();
    }
    private function normalizeStatus(string $status): string
    {
        $s = strtolower(trim($status));

        return in_array($s, ['active', 'suspended', 'inactive'], true) ? $s : '';
    }

    private function applyStatusFilter($query, string $status): void
    {
        if ($status === 'suspended') {
            $query->where('suspended_until', '>', now());
        } elseif ($status === 'active') {
            $query->where('is_active', true)
                ->where(fn ($q) => $q->whereNull('suspended_until')->orWhere('suspended_until', '<=', now()));
        } elseif ($status === 'inactive') {
            $query->where('is_active', false);
        }
    }

    private function applySearch($query, string $search): void
    {
        $search = trim($search);
        if ($search === '') {
            return;
        }
        $query->where(fn ($q) => $q->where('name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%"));
    }

    public function setActiveStatus(User $user, bool $isActive): User
    {
        $user->update([
            'is_active'      => $isActive,
            'deactivated_at' => $isActive ? null : now(),
        ]);

        return $user->fresh();
    }

    public function suspend(User $user, Carbon $until): User
    {
        $user->update([
            'suspended_until' => $until,
            'is_active'       => true,
        ]);

        return $user->fresh();
    }

    public function liftSuspension(User $user): User
    {
        $user->update(['suspended_until' => null]);

        return $user->fresh();
    }

    public function reactivate(User $user): User
    {
        $user->update([
            'is_active'       => true,
            'deactivated_at'  => null,
            'suspended_until' => null,
        ]);

        return $user->fresh();
    }

    public function delete(User $user): void
    {
        $user->delete();
    }

    /**
     * Clear expired suspensions in bulk. Intended for scheduled execution.
     */
    public function liftExpiredSuspensions(): int
    {
        return User::query()
            ->whereNotNull('suspended_until')
            ->where('suspended_until', '<=', now())
            ->update(['suspended_until' => null]);
    }
}

