<?php

declare(strict_types=1);

namespace App\Services\Kpi;

use App\Enums\KpiStatus;
use App\Models\Kpi;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class KpiService
{
    private const INDEX_RELATIONS = ['creator', 'assignee'];

    public function __construct(private readonly KpiAccessService $accessService) {}

    public function listForUser(User $user, array $filters): LengthAwarePaginator
    {
        $context = $this->accessService->resolve($user, $filters['company_id'] ?? null);
        $companyId = (int) $context->company->id;

        $query = $this->baseQuery($companyId);

        if ($context->isAgent()) {
            $query->where('assigned_to_user_id', $user->id);
        }

        $this->applyListFilters($query, $filters);

        $perPage = max(1, min(100, (int) ($filters['per_page'] ?? 50)));

        return $query
            ->with(self::INDEX_RELATIONS)
            ->latest('id')
            ->paginate($perPage)
            ->withQueryString();
    }

    /**
     * @return array{total:int,completion_rate:int,cards:array<int,array<string,mixed>>}
     */
    public function buildStatusCards(User $user, array $filters): array
    {
        $context = $this->accessService->resolve($user, $filters['company_id'] ?? null);
        $companyId = (int) $context->company->id;

        $query = $this->baseQuery($companyId);

        if ($context->isAgent()) {
            $query->where('assigned_to_user_id', $user->id);
        }

        $cardFilters = $filters;
        unset($cardFilters['status']);

        $this->applyListFilters($query, $cardFilters);

        $counts = (clone $query)
            ->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status')
            ->all();

        $pending = (int) ($counts[KpiStatus::PENDING->value] ?? 0);
        $inProgress = (int) ($counts[KpiStatus::IN_PROGRESS->value] ?? 0);
        $completed = (int) ($counts[KpiStatus::COMPLETED->value] ?? 0);
        $cancelled = (int) ($counts[KpiStatus::CANCELLED->value] ?? 0);
        $total = $pending + $inProgress + $completed + $cancelled;

        $pct = static fn(int $count): int => $total === 0 ? 0 : (int) round(($count / $total) * 100);

        return [
            'total' => $total,
            'completion_rate' => $pct($completed),
            'cards' => [
                ['id' => 'pending', 'label' => 'Pending', 'count' => $pending, 'pct' => $pct($pending)],
                ['id' => 'in-progress', 'label' => 'In Progress', 'count' => $inProgress, 'pct' => $pct($inProgress)],
                ['id' => 'completed', 'label' => 'Completed', 'count' => $completed, 'pct' => $pct($completed)],
                ['id' => 'cancelled', 'label' => 'Cancelled', 'count' => $cancelled, 'pct' => $pct($cancelled)],
            ],
        ];
    }

    public function create(User $user, array $data): Kpi
    {
        $context = $this->accessService->resolve($user, $data['company_id'] ?? null);
        $this->accessService->ensureManager($context);

        $assigneeId = isset($data['assigned_to_user_id']) ? (int) $data['assigned_to_user_id'] : null;
        if ($assigneeId !== null) {
            $this->ensureAgentBelongsToCompany((int) $context->company->id, $assigneeId);
        }

        $kpi = Kpi::create([
            'company_id' => $context->company->id,
            'created_by_user_id' => $user->id,
            'assigned_to_user_id' => $assigneeId,
            'name' => $data['name'],
            'category' => $data['category'],
            'objective' => $data['objective'],
            'target_value' => $data['target_value'],
            'expected_outcome' => $data['expected_outcome'],
            'priority' => $data['priority'] ?? 'medium',
            'status' => KpiStatus::PENDING->value,
            'start_date' => $data['start_date'],
            'end_date' => $data['end_date'],
        ]);

        return $this->loadKpi($kpi);
    }

    public function findForUser(User $user, Kpi $kpi, ?int $companyId = null): Kpi
    {
        $context = $this->accessService->resolve($user, $companyId);
        $this->assertKpiInCompany($kpi, (int) $context->company->id);

        if ($context->isAgent() && (int) $kpi->assigned_to_user_id !== (int) $user->id) {
            throw ValidationException::withMessages([
                'authorization' => ['You can only view KPIs assigned to you.'],
            ]);
        }

        return $this->loadKpi($kpi);
    }

    public function update(User $user, Kpi $kpi, array $data): Kpi
    {
        $context = $this->accessService->resolve($user, $data['company_id'] ?? null);
        $this->assertKpiInCompany($kpi, (int) $context->company->id);
        $canManage = $context->canManageKpis();

        if (! $canManage && ! $this->canAgentMutateKpi($context, $user, $kpi)) {
            throw ValidationException::withMessages([
                'authorization' => ['You can only edit KPIs assigned to you.'],
            ]);
        }

        $assigneeId = array_key_exists('assigned_to_user_id', $data)
            ? ($data['assigned_to_user_id'] !== null ? (int) $data['assigned_to_user_id'] : null)
            : $kpi->assigned_to_user_id;

        if (! $canManage) {
            // Agents can edit their own KPI details but cannot reassign ownership.
            $assigneeId = $kpi->assigned_to_user_id;
        }

        if ($assigneeId !== null) {
            $this->ensureAgentBelongsToCompany((int) $context->company->id, $assigneeId);
        }

        $kpi->update([
            'assigned_to_user_id' => $assigneeId,
            'name' => $data['name'] ?? $kpi->name,
            'category' => $data['category'] ?? $kpi->category?->value,
            'objective' => $data['objective'] ?? $kpi->objective,
            'target_value' => $data['target_value'] ?? $kpi->target_value,
            'expected_outcome' => $data['expected_outcome'] ?? $kpi->expected_outcome,
            'priority' => $data['priority'] ?? $kpi->priority?->value,
            'start_date' => $data['start_date'] ?? $kpi->start_date,
            'end_date' => $data['end_date'] ?? $kpi->end_date,
        ]);

        return $this->loadKpi($kpi->fresh());
    }

    public function delete(User $user, Kpi $kpi, ?int $companyId = null): void
    {
        $context = $this->accessService->resolve($user, $companyId);
        $this->assertKpiInCompany($kpi, (int) $context->company->id);

        if (! $context->canManageKpis() && ! $this->canAgentMutateKpi($context, $user, $kpi)) {
            throw ValidationException::withMessages([
                'authorization' => ['You can only delete KPIs assigned to you.'],
            ]);
        }

        $kpi->delete();
    }

    public function updateStatus(User $user, Kpi $kpi, string $status, ?int $companyId = null): Kpi
    {
        $context = $this->accessService->resolve($user, $companyId);
        $this->accessService->ensureAgent($context);
        $this->assertKpiInCompany($kpi, (int) $context->company->id);

        if ((int) $kpi->assigned_to_user_id !== (int) $user->id) {
            throw ValidationException::withMessages([
                'authorization' => ['You can only update KPIs assigned to you.'],
            ]);
        }

        $current = $kpi->status?->value;
        $this->assertAgentStatusTransition($current, $status);

        if ($current !== $status) {
            $kpi->update($this->buildStatusUpdatePayload($kpi, $user->id, $status));
        }

        return $this->loadKpi($kpi->fresh());
    }

    public function updateStatusForManager(User $user, Kpi $kpi, string $status, ?int $companyId = null): Kpi
    {
        $context = $this->accessService->resolve($user, $companyId);
        $this->accessService->ensureManager($context);
        $this->assertKpiInCompany($kpi, (int) $context->company->id);

        $current = $kpi->status?->value;
        $this->assertManagerStatusTransition($current, $status);

        if ($current !== $status) {
            $kpi->update($this->buildStatusUpdatePayload($kpi, $user->id, $status));
        }

        return $this->loadKpi($kpi->fresh());
    }

    private function baseQuery(int $companyId): Builder
    {
        return Kpi::query()->where('company_id', $companyId);
    }

    private function applyListFilters(Builder $query, array $filters): void
    {
        if (! empty($filters['status'])) {
            $query->where('status', (string) $filters['status']);
        }

        if (! empty($filters['priority'])) {
            $query->where('priority', (string) $filters['priority']);
        }

        if (! empty($filters['category'])) {
            $query->where('category', (string) $filters['category']);
        }

        if (! empty($filters['assigned_to_user_id'])) {
            $query->where('assigned_to_user_id', (int) $filters['assigned_to_user_id']);
        }

        if (! empty($filters['search'])) {
            $search = trim((string) $filters['search']);
            $query->where(function (Builder $builder) use ($search): void {
                $builder->where('name', 'like', '%' . $search . '%')
                    ->orWhere('objective', 'like', '%' . $search . '%')
                    ->orWhere('target_value', 'like', '%' . $search . '%')
                    ->orWhere('expected_outcome', 'like', '%' . $search . '%')
                    ->orWhereHas('assignee', function (Builder $assigneeQuery) use ($search): void {
                        $assigneeQuery->where('name', 'like', '%' . $search . '%')
                            ->orWhere('email', 'like', '%' . $search . '%');
                    });
            });
        }
    }

    private function loadKpi(Kpi $kpi): Kpi
    {
        return $kpi->load(self::INDEX_RELATIONS);
    }

    private function assertKpiInCompany(Kpi $kpi, int $companyId): void
    {
        if ((int) $kpi->company_id !== $companyId) {
            throw ValidationException::withMessages([
                'kpi' => ['KPI does not belong to the active company context.'],
            ]);
        }
    }

    private function ensureAgentBelongsToCompany(int $companyId, int $userId): void
    {
        $membership = DB::table('company_users')
            ->where('company_id', $companyId)
            ->where('user_id', $userId)
            ->first();

        if (! $membership) {
            throw ValidationException::withMessages([
                'assigned_to_user_id' => ['Selected agent is not a member of this company.'],
            ]);
        }

        if ((string) $membership->role !== 'agent') {
            throw ValidationException::withMessages([
                'assigned_to_user_id' => ['Selected user must have agent role.'],
            ]);
        }
    }

    private function canAgentMutateKpi(KpiAccessContext $context, User $user, Kpi $kpi): bool
    {
        return $context->isAgent() && (int) $kpi->assigned_to_user_id === (int) $user->id;
    }

    private function assertAgentStatusTransition(?string $currentStatus, string $nextStatus): void
    {
        if ($currentStatus === null) {
            throw ValidationException::withMessages([
                'status' => ['KPI status is not initialized.'],
            ]);
        }

        if ($currentStatus === $nextStatus) {
            return;
        }

        if (in_array($currentStatus, [KpiStatus::COMPLETED->value, KpiStatus::CANCELLED->value], true)) {
            throw ValidationException::withMessages([
                'status' => ['Completed or cancelled KPIs cannot be changed by agents.'],
            ]);
        }

        $allowed = [
            KpiStatus::PENDING->value => [KpiStatus::IN_PROGRESS->value, KpiStatus::CANCELLED->value],
            KpiStatus::IN_PROGRESS->value => [KpiStatus::COMPLETED->value, KpiStatus::CANCELLED->value],
        ];

        if (! in_array($nextStatus, $allowed[$currentStatus] ?? [], true)) {
            throw ValidationException::withMessages([
                'status' => ['Invalid KPI status transition.'],
            ]);
        }
    }

    private function assertManagerStatusTransition(?string $currentStatus, string $nextStatus): void
    {
        if ($currentStatus === null) {
            throw ValidationException::withMessages([
                'status' => ['KPI status is not initialized.'],
            ]);
        }

        if ($currentStatus === $nextStatus) {
            return;
        }

        $allowed = [
            KpiStatus::PENDING->value => [KpiStatus::IN_PROGRESS->value, KpiStatus::CANCELLED->value],
            KpiStatus::IN_PROGRESS->value => [KpiStatus::PENDING->value, KpiStatus::COMPLETED->value, KpiStatus::CANCELLED->value],
            KpiStatus::COMPLETED->value => [KpiStatus::IN_PROGRESS->value, KpiStatus::PENDING->value],
            KpiStatus::CANCELLED->value => [KpiStatus::PENDING->value],
        ];

        if (! in_array($nextStatus, $allowed[$currentStatus] ?? [], true)) {
            throw ValidationException::withMessages([
                'status' => ['Invalid KPI status transition.'],
            ]);
        }
    }

    /**
     * @return array<string,mixed>
     */
    private function buildStatusUpdatePayload(Kpi $kpi, int $updatedByUserId, string $nextStatus): array
    {
        $payload = [
            'status' => $nextStatus,
            'last_status_updated_by_user_id' => $updatedByUserId,
            'started_at' => $kpi->started_at,
            'completed_at' => null,
            'cancelled_at' => null,
        ];

        if ($nextStatus === KpiStatus::PENDING->value) {
            $payload['started_at'] = null;

            return $payload;
        }

        if ($nextStatus === KpiStatus::IN_PROGRESS->value) {
            $payload['started_at'] = $kpi->started_at ?? now();

            return $payload;
        }

        if ($nextStatus === KpiStatus::COMPLETED->value) {
            $payload['started_at'] = $kpi->started_at ?? now();
            $payload['completed_at'] = now();

            return $payload;
        }

        if ($nextStatus === KpiStatus::CANCELLED->value) {
            $payload['cancelled_at'] = now();
        }

        return $payload;
    }
}
