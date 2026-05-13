<?php

namespace App\Services\Admin;

use App\Models\User;
use Illuminate\Support\Collection;

class DashboardService
{
    public function overview(): array
    {
        return [
            'total_users'     => User::count(),
            'active_users'    => User::where('is_active', true)
                ->where(function ($q): void {
                    $q->whereNull('suspended_until')->orWhere('suspended_until', '<=', now());
                })->count(),
            'suspended_users' => User::whereNotNull('suspended_until')->where('suspended_until', '>', now())->count(),
            'inactive_users'  => User::where('is_active', false)->count(),
            'verified_users'  => User::whereNotNull('email_verified_at')->count(),
            'onboarded_users' => User::whereNotNull('onboarding_completed_at')->count(),
            'new_users_7d'    => User::where('created_at', '>=', now()->subDays(7))->count(),
        ];
    }

    public function recentUsers(int $limit = 8): Collection
    {
        return User::latest()->take($limit)->get();
    }
}
