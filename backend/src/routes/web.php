<?php

use App\Http\Controllers\Admin\AI\AiHealthController;
use App\Http\Controllers\Admin\AI\AiLogController;
use App\Http\Controllers\Admin\AI\AiManagementController;
use App\Http\Controllers\Admin\Auth\LoginController;
use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\Enterprise\DemoRequestController;
use App\Http\Controllers\Admin\MapProviderSettingController;
use App\Http\Controllers\Admin\UserManagementController;
use App\Http\Controllers\Web\InternalOnboardingRedirectController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/onboarding/internal/{invitation}/{token}', InternalOnboardingRedirectController::class)
    ->middleware('signed')
    ->name('internal.onboarding.invite');

Route::prefix('admin')->name('admin.')->group(function (): void {
    Route::middleware('guest:admin')->group(function (): void {
        Route::get('/login', [LoginController::class, 'show'])->name('login.show');
        Route::post('/login', [LoginController::class, 'store'])->name('login.store');
    });

    Route::middleware(['auth:admin', 'admin.active'])->group(function (): void {
        Route::get('/dashboard', DashboardController::class)->name('dashboard');
        Route::post('/settings/map-provider', [MapProviderSettingController::class, 'update'])
            ->name('settings.map-provider.update')
            ->middleware('admin.permission:manage_users');
        Route::post('/logout', [LoginController::class, 'destroy'])->name('logout');

        // ── AI Management ──────────────────────────────────────
        Route::prefix('ai')->name('ai.')->group(function (): void {
            Route::get('/', [AiManagementController::class, 'index'])->name('index');
            Route::get('/analytics', [AiManagementController::class, 'analytics'])->name('analytics');
            Route::get('/logs', [AiLogController::class, 'index'])->name('logs.index');
            Route::get('/logs/{log}', [AiLogController::class, 'show'])->name('logs.show');
            Route::get('/health', [AiHealthController::class, 'check'])->name('health');
            Route::post('/health/test/{provider}', [AiHealthController::class, 'testProvider'])->name('health.test');
            Route::post('/alerts/{alert}/resolve', [AiManagementController::class, 'resolveAlert'])->name('alerts.resolve');
        });

        // ── Users ──────────────────────────────────────────────
        Route::prefix('users')->name('users.')->middleware('admin.permission:manage_users')->group(function (): void {
            Route::get('/', [UserManagementController::class, 'index'])->name('index');
            Route::get('/{user}', [UserManagementController::class, 'show'])->name('show');
            Route::patch('/{user}/status', [UserManagementController::class, 'updateStatus'])->name('status.update');
            Route::post('/{user}/suspend', [UserManagementController::class, 'suspend'])->name('suspend');
            Route::post('/{user}/reactivate', [UserManagementController::class, 'reactivate'])->name('reactivate');
            Route::patch('/{user}/role', [UserManagementController::class, 'updateRole'])->name('role.update');
            Route::delete('/{user}', [UserManagementController::class, 'destroy'])->name('destroy');
        });

        // ── Enterprise ─────────────────────────────────────────
        Route::prefix('enterprise')->name('enterprise.')->middleware('admin.permission:manage_users')->group(function (): void {
            Route::prefix('demo-requests')->name('demo-requests.')->group(function (): void {
                Route::get('/', [DemoRequestController::class, 'index'])->name('index');
                Route::get('/{demoRequest}', [DemoRequestController::class, 'show'])->name('show');
                Route::patch('/{demoRequest}/activate', [DemoRequestController::class, 'activate'])->name('activate');
            });
        });
    });
});
