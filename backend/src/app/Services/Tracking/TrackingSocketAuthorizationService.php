<?php

declare(strict_types=1);

namespace App\Services\Tracking;

use App\Models\Company;
use App\Models\User;
use App\Services\Company\CompanyContextService;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Decides what a realtime tracking WebSocket connection may receive.
 *
 * The Node relay calls this (with the viewer's bearer token) when a socket
 * authenticates, when it subscribes to a task, and periodically to refresh a
 * supervisor's agent list. Rules mirror AgentLocationSnapshotService:
 *  - owner / admin (and legacy manager roles): every agent in the company
 *  - supervisor: only agents whose supervisor_user_id is the supervisor
 *  - agent: only themselves, plus tasks they are assigned to / observe / created
 */
class TrackingSocketAuthorizationService
{
    public const MAX_TASK_IDS = 200;

    private const COMPANY_WIDE_ROLES = ['owner', 'admin', 'manager', 'management'];

    public function __construct(private readonly CompanyContextService $companyContextService) {}

    /**
     * @param  array<int, int>  $taskIds
     */
    public function authorize(User $user, ?string $companyHint, array $taskIds = []): array
    {
        $context = $this->companyContextService->resolve($user, $this->resolveCompanyId($companyHint));
        /** @var Company $company */
        $company = $context['company'];
        $companyRole = strtolower((string) $context['role']);

        $scope = match (true) {
            in_array($companyRole, self::COMPANY_WIDE_ROLES, true) => 'company',
            $companyRole === 'supervisor' => 'supervisor',
            default => 'self',
        };

        $visibleUserIds = match ($scope) {
            'company' => null,
            'supervisor' => $this->supervisedAgentIds($user, (int) $company->id),
            default => [(int) $user->id],
        };

        return [
            'user' => [
                'id' => (int) $user->id,
                'name' => $user->name,
                'email' => $user->email,
            ],
            'company' => [
                'id' => (int) $company->id,
                'company_id' => $company->company_id,
            ],
            'company_role' => $companyRole,
            // Kept as management|agent for backwards compatibility with clients.
            'access_role' => $scope === 'self' ? 'agent' : 'management',
            'scope' => $scope,
            'visible_user_ids' => $visibleUserIds,
            'allowed_task_ids' => $this->allowedTaskIds($user, (int) $company->id, $scope, $visibleUserIds, $taskIds),
        ];
    }

    private function resolveCompanyId(?string $companyHint): ?int
    {
        $hint = trim((string) $companyHint);

        if ($hint === '') {
            return null;
        }

        if (ctype_digit($hint)) {
            return (int) $hint;
        }

        $companyId = Company::query()->where('company_id', $hint)->value('id');

        if ($companyId === null) {
            throw ValidationException::withMessages([
                'company_id' => ['You are not attached to the selected company context.'],
            ]);
        }

        return (int) $companyId;
    }

    /**
     * @return array<int, int>
     */
    private function supervisedAgentIds(User $supervisor, int $companyId): array
    {
        $ids = DB::table('users')
            ->join('company_users', 'company_users.user_id', '=', 'users.id')
            ->where('company_users.company_id', $companyId)
            ->where('users.supervisor_user_id', $supervisor->id)
            ->distinct()
            ->orderBy('users.id')
            ->pluck('users.id')
            ->map(static fn(mixed $id): int => (int) $id)
            ->values()
            ->all();

        // Supervisors go on field trips too and must see their own live trail.
        $ids[] = (int) $supervisor->id;

        return array_values(array_unique($ids));
    }

    /**
     * @param  array<int, int>|null  $visibleUserIds
     * @param  array<int, int>  $taskIds
     * @return array<int, int>
     */
    private function allowedTaskIds(User $user, int $companyId, string $scope, ?array $visibleUserIds, array $taskIds): array
    {
        $taskIds = array_values(array_unique(array_filter(
            array_map('intval', array_slice($taskIds, 0, self::MAX_TASK_IDS)),
            static fn(int $id): bool => $id > 0,
        )));

        if ($taskIds === []) {
            return [];
        }

        $query = DB::table('tasks')
            ->where('company_id', $companyId)
            ->whereIn('id', $taskIds);

        if ($scope !== 'company') {
            $userIds = $visibleUserIds ?? [];
            $actorId = (int) $user->id;

            $query->where(function ($q) use ($userIds, $actorId, $scope): void {
                $q->where('created_by_user_id', $actorId);

                if ($userIds !== []) {
                    $q->orWhereIn('assigned_agent_id', $userIds)
                        ->orWhereExists(function ($sub) use ($userIds): void {
                            $sub->selectRaw('1')
                                ->from('task_assignments')
                                ->whereColumn('task_assignments.task_id', 'tasks.id')
                                ->where('task_assignments.is_current', true)
                                ->whereIn('task_assignments.assigned_agent_id', $userIds);
                        });
                }

                if ($scope === 'self') {
                    $q->orWhereExists(function ($sub) use ($actorId): void {
                        $sub->selectRaw('1')
                            ->from('task_observers')
                            ->whereColumn('task_observers.task_id', 'tasks.id')
                            ->where('task_observers.user_id', $actorId);
                    });
                }
            });
        }

        return $query->orderBy('id')
            ->pluck('id')
            ->map(static fn(mixed $id): int => (int) $id)
            ->values()
            ->all();
    }
}
