<?php

namespace App\Http\Middleware;

use App\Models\Admin;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureAdminHasPermission
{
    public function handle(Request $request, Closure $next, string $ability): Response
    {
        $admin = auth('admin')->user();

        if (! $admin instanceof Admin || ! $admin->canAccessAbility($ability)) {
            abort(403, 'You are not authorized to perform this action.');
        }

        return $next($request);
    }
}
