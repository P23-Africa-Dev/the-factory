<?php

declare(strict_types=1);

namespace App\Services\FieldActivity;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Who may see whose field activity, shared by the journey screens, the live
 * map, analytics and ELY:
 * - owner / admin: everyone in the company;
 * - supervisor: their own team (users.supervisor_user_id) and themselves;
 * - agent (and any other role): only themselves.
 */
class FieldActivityVisibility
{
    /**
     * @return list<int>|null  null = no restriction (everyone in the company)
     */
    public function visibleUserIds(User $actor, int $companyId, string $role): ?array
    {
        if (in_array($role, ['owner', 'admin'], true)) {
            return null;
        }

        if ($role !== 'supervisor') {
            return [(int) $actor->id];
        }

        $team = DB::table('users')
            ->join('company_users', 'company_users.user_id', '=', 'users.id')
            ->where('company_users.company_id', $companyId)
            ->where('users.supervisor_user_id', $actor->id)
            ->pluck('users.id')
            ->map(static fn ($id): int => (int) $id)
            ->all();

        return array_values(array_unique([(int) $actor->id, ...$team]));
    }

    public function canView(User $actor, int $companyId, string $role, int $targetUserId): bool
    {
        $ids = $this->visibleUserIds($actor, $companyId, $role);

        return $ids === null || in_array($targetUserId, $ids, true);
    }
}
