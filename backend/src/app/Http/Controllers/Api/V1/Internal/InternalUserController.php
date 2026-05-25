<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Internal;

use App\Http\Controllers\Controller;
use App\Http\Requests\Internal\AssignSupervisorRequest;
use App\Http\Requests\Internal\CreateInternalUserRequest;
use App\Http\Requests\Internal\FetchInternalUsersRequest;
use App\Http\Requests\Internal\ResendInternalInviteRequest;
use App\Http\Resources\InternalUserListResource;
use App\Http\Resources\InternalUserResource;
use App\Models\User;
use App\Services\Internal\InternalUserFetchService;
use App\Services\Internal\InternalUserOnboardingService;
use Illuminate\Http\JsonResponse;

class InternalUserController extends Controller
{
    public function __construct(
        private readonly InternalUserOnboardingService $service,
        private readonly InternalUserFetchService $fetchService,
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
