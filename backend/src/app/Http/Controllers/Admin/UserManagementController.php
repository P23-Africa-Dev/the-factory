<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\SuspendUserRequest;
use App\Http\Requests\Admin\UpdateUserRoleRequest;
use App\Http\Requests\Admin\UpdateUserStatusRequest;
use App\Models\User;
use App\Services\Admin\UserAdminService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;

class UserManagementController extends Controller
{
    public function __construct(private readonly UserAdminService $userAdminService) {}

    public function index(Request $request): View|JsonResponse
    {
        $tab = $request->string('tab')->toString();
        if (! in_array($tab, ['owners', 'internal'], true)) {
            $tab = 'owners';
        }

        $filters = [
            'search'       => $request->string('search')->toString(),
            'status'       => $request->string('status')->toString(),
            'account_type' => $request->string('account_type')->toString(),
            'role'         => $request->string('role')->toString(),
        ];

        $users = $tab === 'internal'
            ? $this->userAdminService->paginateInternalUsers($filters)
            : $this->userAdminService->paginateAccountOwners($filters);

        if ($request->expectsJson() || $request->ajax()) {
            $partial = $tab === 'internal'
                ? 'admin.users.partials.internal-users-table'
                : 'admin.users.partials.account-owners-table';

            return response()->json([
                'html' => view($partial, ['users' => $users])->render(),
            ]);
        }

        $ownerCount    = \App\Models\User::whereNull('internal_role')->count();
        $internalCount = \App\Models\User::whereNotNull('internal_role')->count();

        return view('admin.users.index', [
            'users'         => $users,
            'filters'       => $filters,
            'tab'           => $tab,
            'ownerCount'    => $ownerCount,
            'internalCount' => $internalCount,
        ]);
    }

    public function show(User $user): View
    {
        $isInternal = $user->internal_role !== null;

        $user->load([
            'companies',
            'ownedWorkspaces',
            'supervisor:id,name,email',
        ]);

        if ($isInternal) {
            $user->load(['agents' => fn ($q) => $q->select('id', 'name', 'email', 'internal_role', 'supervisor_user_id')]);
        }

        $company     = $user->companies->first();
        $workspace   = $user->ownedWorkspaces->first();
        $accountOwner = null;

        if ($isInternal && $company) {
            $accountOwner = $company->users()
                ->wherePivot('role', 'owner')
                ->select('users.id', 'users.name', 'users.email')
                ->first();
        }

        return view('admin.users.show', [
            'user'         => $user,
            'isInternal'   => $isInternal,
            'company'      => $company,
            'workspace'    => $workspace,
            'accountOwner' => $accountOwner,
        ]);
    }

    public function updateStatus(UpdateUserStatusRequest $request, User $user): RedirectResponse
    {
        $this->userAdminService->setActiveStatus($user, (bool) $request->boolean('is_active'));

        return redirect()->route('admin.users.show', $user)
            ->with('status', 'User status updated successfully.');
    }

    public function suspend(SuspendUserRequest $request, User $user): RedirectResponse
    {
        $until = $request->input('suspend_type') === 'duration'
            ? now()->addDays((int) $request->input('suspend_days'))->endOfDay()
            : Carbon::parse($request->input('suspend_until'))->endOfDay();

        $this->userAdminService->suspend($user, $until);

        return redirect()->route('admin.users.show', $user)
            ->with('status', "User suspended until {$until->format('M j, Y')}.");
    }

    public function reactivate(User $user): RedirectResponse
    {
        $this->userAdminService->reactivate($user);

        return redirect()->route('admin.users.show', $user)
            ->with('status', 'User reactivated successfully.');
    }

    public function destroy(User $user): RedirectResponse
    {
        $this->userAdminService->delete($user);

        return redirect()->route('admin.users.index')
            ->with('status', 'User has been deleted.');
    }

    public function updateRole(UpdateUserRoleRequest $request, User $user): RedirectResponse
    {
        $user->update(['internal_role' => $request->validated('internal_role') ?: null]);

        return redirect()->route('admin.users.show', $user)
            ->with('status', 'User role updated successfully.');
    }
}

