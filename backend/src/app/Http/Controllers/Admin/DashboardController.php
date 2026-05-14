<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\Admin\DashboardService;
use Illuminate\View\View;

class DashboardController extends Controller
{
    public function __construct(private readonly DashboardService $dashboardService) {}

    public function __invoke(): View
    {
        return view('admin.dashboard.index', [
            'stats'       => $this->dashboardService->overview(),
            'recentUsers' => $this->dashboardService->recentUsers(),
        ]);
    }
}
