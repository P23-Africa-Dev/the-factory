<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

class EnsureApiAccessRole
{
    /**
     * @param  'management'|'agent'  $scope
     */
    public function handle(Request $request, Closure $next, string $scope): Response
    {
        $user = $request->user();

        if (! $user) {
            throw new AuthorizationException('Unauthenticated request context.');
        }

        $activeRoles = DB::table('company_users')
            ->join('companies', 'companies.id', '=', 'company_users.company_id')
            ->where('company_users.user_id', $user->id)
            ->where('companies.status', 'active')
            ->pluck('company_users.role')
            ->map(static fn(mixed $role): string => (string) $role)
            ->unique()
            ->values()
            ->all();

        $hasAgentMembership = in_array('agent', $activeRoles, true);
        $hasManagementMembership = count(array_intersect($activeRoles, ['owner', 'admin', 'supervisor'])) > 0;

        $isAgent = $user->internal_role === 'agent'
            || ($user->internal_role === null && $hasAgentMembership && ! $hasManagementMembership);

        if ($scope === 'management' && $isAgent) {
            throw new AuthorizationException('Agents cannot access management endpoints.');
        }

        if ($scope === 'agent' && ! $isAgent) {
            throw new AuthorizationException('Only agents can access agent endpoints.');
        }

        return $next($request);
    }
}
