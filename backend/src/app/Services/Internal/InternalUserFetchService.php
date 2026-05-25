<?php

declare(strict_types=1);

namespace App\Services\Internal;

use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Builder;

class InternalUserFetchService
{
    public function __construct(private readonly InternalUserAccessService $accessService) {}

    /**
     * Fetch internal users within the authenticated user's company context.
     * 
     * Enforces company isolation: only returns users from the same company.
     * 
     * @param  User  $actor
     * @param  string|null  $roleFilter  Filter by internal_role: 'supervisor', 'agent', or null for all
     * @param  int|null  $companyId  Override to fetch from specific company
     * @param  string|null  $onboardingStatus  Filter by onboarding status (e.g. pending_onboarding, active)
     * @param  bool  $includeInactive  Include inactive users when true
     * 
     * @return Collection<int, User>
     */
    public function fetchByCompanyAndRole(
        User $actor,
        ?string $roleFilter = null,
        ?int $companyId = null,
        ?string $onboardingStatus = null,
        bool $includeInactive = false,
    ): Collection {
        $context = $this->accessService->resolveCompanyContext($actor, $companyId);
        $this->accessService->ensureCanManageInternalUsers((string) $context['role']);
        $company = $context['company'];

        $query = $company->users()
            ->with('latestInternalInvitation')
            ->whereNotNull('internal_role')
            ->orderBy('internal_role')
            ->orderBy('name');

        if (! $includeInactive && $onboardingStatus === null) {
            $query->where('is_active', true);
        }

        if ($roleFilter !== null) {
            $query->where('internal_role', $roleFilter);
        }

        if ($onboardingStatus !== null) {
            $query->where('onboarding_status', $onboardingStatus);
        }

        return $query->get();
    }

    /**
     * @param  array<string, mixed>  $filters
     */
    public function fetchByCompanyAndRolePaginated(
        User $actor,
        array $filters,
    ): LengthAwarePaginator {
        $context = $this->accessService->resolveCompanyContext(
            $actor,
            isset($filters['company_id']) ? (int) $filters['company_id'] : null,
        );
        $this->accessService->ensureCanManageInternalUsers((string) $context['role']);

        $query = $this->baseQuery((int) $context['company']->id);

        if (! empty($filters['role'])) {
            $query->where('internal_role', (string) $filters['role']);
        }

        if (! empty($filters['onboarding_status'])) {
            $query->where('onboarding_status', (string) $filters['onboarding_status']);
        }

        if (! empty($filters['status'])) {
            $status = (string) $filters['status'];

            if ($status === 'active') {
                $query->where('onboarding_status', 'active')
                    ->where('is_active', true);
            } elseif ($status === 'pending_onboarding') {
                $query->where('onboarding_status', 'pending_onboarding');
            } elseif ($status === 'inactive') {
                $query->where('is_active', false);
            }
        } elseif (empty($filters['include_inactive']) && empty($filters['onboarding_status'])) {
            $query->where('is_active', true);
        }

        if (! empty($filters['zone'])) {
            $query->where('assigned_zone', (string) $filters['zone']);
        }

        if (! empty($filters['search'])) {
            $search = '%' . trim((string) $filters['search']) . '%';
            $query->where(static function (Builder $sub) use ($search): void {
                $sub->where('name', 'like', $search)
                    ->orWhere('email', 'like', $search)
                    ->orWhere('assigned_zone', 'like', $search)
                    ->orWhere('phone_number', 'like', $search);
            });
        }

        $perPage = (int) ($filters['per_page'] ?? 20);

        return $query->paginate($perPage)->withQueryString();
    }

    private function baseQuery(int $companyId): Builder
    {
        return User::query()
            ->whereNotNull('internal_role')
            ->whereExists(function ($sub) use ($companyId): void {
                $sub->selectRaw('1')
                    ->from('company_users')
                    ->whereColumn('company_users.user_id', 'users.id')
                    ->where('company_users.company_id', $companyId);
            })
            ->with('latestInternalInvitation')
            ->orderBy('internal_role')
            ->orderBy('name');
    }

    /**
     * Fetch supervisors available as project managers for the given company context.
     * 
     * Project managers can only be supervisors or admins. This method returns
     * supervisors who are active and belong to the company.
     * 
     * @param  User  $actor
     * @param  int|null  $companyId
     * 
     * @return Collection<int, User>
     */
    public function fetchProjectManagerCandidates(User $actor, ?int $companyId = null): Collection
    {
        return $this->fetchByCompanyAndRole($actor, 'supervisor', $companyId);
    }

    /**
     * Build a compact onboarding-state summary for manager dashboards.
     *
     * @return array{total:int, active:int, pending_onboarding:int, inactive:int}
     */
    public function summarizeOnboarding(Collection $users): array
    {
        return [
            'total' => $users->count(),
            'active' => $users->where('onboarding_status', 'active')->count(),
            'pending_onboarding' => $users->where('onboarding_status', 'pending_onboarding')->count(),
            'inactive' => $users->where('is_active', false)->count(),
        ];
    }
}
