<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Internal;

use App\Http\Controllers\Controller;
use App\Http\Requests\Internal\AssignSupervisorRequest;
use App\Http\Requests\Internal\CreateInternalUserRequest;
use App\Http\Requests\Internal\FetchInternalUsersRequest;
use App\Http\Requests\Internal\ResendInternalInviteRequest;
use App\Http\Requests\Internal\UpdateInternalUserRequest;
use App\Http\Resources\InternalUserListResource;
use App\Http\Resources\InternalUserResource;
use App\Models\User;
use App\Services\Internal\InternalUserFetchService;
use App\Services\Internal\InternalUserOnboardingService;
use App\Services\Internal\InternalUserAccessService;
use App\Services\Workforce\AgentPresenceService;
use Illuminate\Http\JsonResponse;

class InternalUserController extends Controller
{
    public function __construct(
        private readonly InternalUserOnboardingService $service,
        private readonly InternalUserFetchService $fetchService,
        private readonly InternalUserAccessService $accessService,
    ) {}

    public function index(FetchInternalUsersRequest $request): JsonResponse
    {
        $companyId = $request->validated('company_id');
        $onboardingStatus = $request->validated('onboarding_status');

        $hasPaginationOrSearch = $request->filled('per_page')
            || $request->filled('page')
            || $request->filled('search')
            || $request->filled('zone')
            || $request->filled('status');

        if ($hasPaginationOrSearch) {
            $paginated = $this->fetchService->fetchByCompanyAndRolePaginated(
                actor: $request->user(),
                filters: $request->validated(),
            );

            $companyId = (int) ($request->validated('company_id') ?? 0);
            if ($companyId <= 0) {
                $companyId = (int) $this->accessService
                    ->resolveCompanyContext($request->user(), null)['company']->id;
            }
            $userIds = collect($paginated->items())->pluck('id')->map(static fn ($id): int => (int) $id)->all();
            $presenceMap = $this->fetchService->resolvePresenceForUsers($companyId, $userIds);
            foreach ($paginated->items() as $user) {
                $user->setAttribute(
                    'agent_presence',
                    $presenceMap[(int) $user->id] ?? $presenceMap[$user->id] ?? app(AgentPresenceService::class)->emptyPresence(),
                );
            }

            return $this->success(
                'Internal users retrieved successfully',
                [
                    'items' => InternalUserListResource::collection($paginated->items()),
                    'pagination' => [
                        'next_page_url' => $paginated->nextPageUrl(),
                        'prev_page_url' => $paginated->previousPageUrl(),
                        'per_page' => $paginated->perPage(),
                        'current_page' => $paginated->currentPage(),
                        'last_page' => $paginated->lastPage(),
                        'total' => $paginated->total(),
                    ],
                ],
            );
        }

        $users = $this->fetchService->fetchByCompanyAndRole(
            actor: $request->user(),
            roleFilter: $request->string('role')->toString() ?: null,
            companyId: $companyId !== null ? (int) $companyId : null,
            onboardingStatus: $onboardingStatus !== null ? (string) $onboardingStatus : null,
            includeInactive: (bool) $request->validated('include_inactive', false),
        );

        return $this->success(
            'Internal users retrieved successfully',
            InternalUserListResource::collection($users),
        );
    }

    public function onboardingStatus(FetchInternalUsersRequest $request): JsonResponse
    {
        $companyId = $request->validated('company_id');
        $onboardingStatus = $request->validated('onboarding_status');

        $users = $this->fetchService->fetchByCompanyAndRole(
            actor: $request->user(),
            roleFilter: $request->string('role')->toString() ?: null,
            companyId: $companyId !== null ? (int) $companyId : null,
            onboardingStatus: $onboardingStatus !== null ? (string) $onboardingStatus : null,
            includeInactive: true,
        );

        return $this->success(
            'Internal onboarding status retrieved successfully',
            [
                'summary' => $this->fetchService->summarizeOnboarding($users),
                'items' => InternalUserListResource::collection($users),
            ],
        );
    }

    public function store(CreateInternalUserRequest $request): JsonResponse
    {
        $result = $this->service->createByManager($request->user(), $request->validated());

        return $this->success(
            message: 'Internal user created and onboarding invitation sent.',
            data: [
                'user' => new InternalUserResource($result['user']),
                'invite_expires_at' => $result['invite_expires_at']?->toIso8601String(),
            ],
            status: 201,
        );
    }

    public function resendInvite(ResendInternalInviteRequest $request, User $user): JsonResponse
    {
        $companyId = $request->validated('company_id');

        $result = $this->service->resendInvite(
            actor: $request->user(),
            user: $user,
            companyId: $companyId !== null ? (int) $companyId : null,
        );

        return $this->success(
            message: 'Onboarding invitation sent successfully.',
            data: [
                'invite_expires_at' => $result['invite_expires_at']?->toIso8601String(),
            ],
        );
    }

    public function update(UpdateInternalUserRequest $request, User $user): JsonResponse
    {
        $updated = $this->service->updateByManager($request->user(), $user, $request->validated());

        return $this->success(
            message: 'Internal user updated successfully.',
            data: ['user' => new InternalUserResource($updated)],
        );
    }

    public function assignSupervisor(AssignSupervisorRequest $request, User $user): JsonResponse
    {
        $companyId = $request->validated('company_id');

        $updatedAgent = $this->service->assignSupervisor(
            actor: $request->user(),
            agent: $user,
            supervisorUserId: (int) $request->validated('supervisor_user_id'),
            companyId: $companyId !== null ? (int) $companyId : null,
        );

        return $this->success(
            message: 'Supervisor assigned successfully.',
            data: ['user' => new InternalUserResource($updatedAgent)],
        );
    }
}
