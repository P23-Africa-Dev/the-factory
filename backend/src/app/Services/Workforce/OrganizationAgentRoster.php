<?php

declare(strict_types=1);

namespace App\Services\Workforce;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/**
 * People who can receive work in an organization.
 *
 * Active means the account belongs to the company, is_active is true, and it
 * is not deactivated or currently suspended. A live tracking session is a
 * separate "online" state and is not required here.
 */
final class OrganizationAgentRoster
{
    /**
     * @var array<int, string>
     */
    public const ASSIGNABLE_ROLES = ['owner', 'admin', 'supervisor', 'agent'];

    /**
     * @return Builder<User>
     */
    public function assignableQuery(int $companyId, ?int $supervisorUserId = null): Builder
    {
        return User::query()
            ->select(['users.id', 'users.name', 'users.email'])
            ->selectRaw('company_users.role as company_role')
            ->join(
                'company_users',
                static fn ($join) => $join
                    ->on('company_users.user_id', '=', 'users.id')
                    ->where('company_users.company_id', '=', $companyId)
            )
            ->where('users.is_active', true)
            ->whereNull('users.deactivated_at')
            ->where(static function ($query): void {
                $query->whereNull('users.suspended_until')
                    ->orWhere('users.suspended_until', '<=', now());
            })
            ->whereIn('company_users.role', self::ASSIGNABLE_ROLES)
            ->when($supervisorUserId !== null, static function ($query) use ($supervisorUserId): void {
                $query->where('users.supervisor_user_id', $supervisorUserId);
            });
    }

    /**
     * Agents who exist in the organization. Offline agents stay in this list.
     *
     * @return Builder<User>
     */
    public function activeAgentsQuery(int $companyId, ?int $supervisorUserId = null): Builder
    {
        return $this->assignableQuery($companyId, $supervisorUserId)
            ->where(static function ($query): void {
                $query->where('company_users.role', 'agent')
                    ->orWhere('users.internal_role', 'agent');
            });
    }
}
