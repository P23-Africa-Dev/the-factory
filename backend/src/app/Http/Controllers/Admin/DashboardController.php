<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Admin;
use App\Services\Admin\DashboardService;
use App\Services\Map\MapProviderSettingService;
use Illuminate\View\View;

class DashboardController extends Controller
{
    public function __construct(
        private readonly DashboardService $dashboardService,
        private readonly MapProviderSettingService $mapProviderSettingService,
    ) {}

    public function __invoke(): View
    {
        $admin = auth('admin')->user();

        return view('admin.dashboard.index', [
            'stats' => $this->dashboardService->overview(),
            'recentUsers' => $this->dashboardService->recentUsers(),
            'activeMapProvider' => $this->mapProviderSettingService->getProvider(),
            'canManageMapProvider' => $admin instanceof Admin && $admin->canAccessAbility('manage_users'),
        ]);
    }
}
