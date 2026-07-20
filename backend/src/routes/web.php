<?php

use App\Http\Controllers\Admin\AI\AiHealthController;
use App\Http\Controllers\Admin\AI\AiLogController;
use App\Http\Controllers\Admin\AI\AiManagementController;
use App\Http\Controllers\Admin\AI\AiIntentRoutingSettingController;
use App\Http\Controllers\Admin\AI\AiStackSettingController;
use App\Http\Controllers\Admin\Auth\LoginController;
use App\Http\Controllers\Admin\Billing\BillingEnforcementController;
use App\Http\Controllers\Admin\Billing\BillingOverviewController;
use App\Http\Controllers\Admin\Billing\AdminPaymentLinkController;
use App\Http\Controllers\Admin\Billing\BillingPlanController;
use App\Http\Controllers\Admin\Billing\CompanyDemoController;
use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\Map\MapPoiDisplayController as AdminMapPoiDisplayController;
use App\Http\Controllers\Admin\MapCredit\MapCreditController as AdminMapCreditController;
use App\Http\Controllers\Admin\MapCredit\MapCreditSkuController as AdminMapCreditSkuController;
use App\Http\Controllers\Admin\Database\DatabaseLockController;
use App\Http\Controllers\Admin\Database\DatabaseManagerController;
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
            Route::post('/stack', [AiStackSettingController::class, 'update'])
                ->name('stack.update')
                ->middleware('admin.permission:manage_ai');
            Route::post('/intent-routing', [AiIntentRoutingSettingController::class, 'update'])
                ->name('intent-routing.update')
                ->middleware('admin.permission:manage_ai');
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
            Route::post('/{user}/restore', [UserManagementController::class, 'restore'])->name('restore');
            Route::delete('/{user}/force', [UserManagementController::class, 'forceDestroy'])->name('force-destroy');
            Route::post('/{user}/payment-link', [AdminPaymentLinkController::class, 'forUser'])->name('payment-link');
        });

        // ── Enterprise ─────────────────────────────────────────
        Route::prefix('enterprise')->name('enterprise.')->middleware('admin.permission:manage_users')->group(function (): void {
            Route::prefix('demo-requests')->name('demo-requests.')->group(function (): void {
                Route::get('/', [DemoRequestController::class, 'index'])->name('index');
                Route::get('/{demoRequest}', [DemoRequestController::class, 'show'])->name('show');
                Route::patch('/{demoRequest}/activate', [DemoRequestController::class, 'activate'])->name('activate');
                Route::post('/{demoRequest}/payment-link', [AdminPaymentLinkController::class, 'forDemoRequest'])->name('payment-link');
            });
        });

        // ── Manage Database (super_admin only, passcode-gated) ─
        Route::prefix('database')->name('database.')->middleware('admin.permission:manage_database')->group(function (): void {
            Route::get('/lock', [DatabaseLockController::class, 'show'])->name('lock.show');
            Route::post('/unlock', [DatabaseLockController::class, 'unlock'])->name('unlock');
            Route::post('/lock', [DatabaseLockController::class, 'lock'])->name('lock');
            Route::post('/passcode/reset', [DatabaseLockController::class, 'resetWithMasterToken'])->name('passcode.reset');

            Route::middleware('admin.db.unlocked')->group(function (): void {
                Route::post('/passcode/change', [DatabaseLockController::class, 'changePasscode'])->name('passcode.change');

                Route::get('/', [DatabaseManagerController::class, 'index'])->name('index');

                Route::get('/tables/create', [DatabaseManagerController::class, 'createTableForm'])->name('tables.create');
                Route::post('/tables', [DatabaseManagerController::class, 'storeTable'])->name('tables.store');
                Route::delete('/tables/{table}', [DatabaseManagerController::class, 'dropTable'])
                    ->where('table', '[A-Za-z0-9_]+')->name('tables.destroy');
                Route::get('/tables/{table}', [DatabaseManagerController::class, 'showTable'])
                    ->where('table', '[A-Za-z0-9_]+')->name('tables.show');

                Route::post('/tables/{table}/columns', [DatabaseManagerController::class, 'addColumn'])
                    ->where('table', '[A-Za-z0-9_]+')->name('columns.store');
                Route::delete('/tables/{table}/columns/{column}', [DatabaseManagerController::class, 'dropColumn'])
                    ->where(['table' => '[A-Za-z0-9_]+', 'column' => '[A-Za-z0-9_]+'])->name('columns.destroy');

                Route::get('/tables/{table}/rows/create', [DatabaseManagerController::class, 'createRow'])
                    ->where('table', '[A-Za-z0-9_]+')->name('rows.create');
                Route::post('/tables/{table}/rows', [DatabaseManagerController::class, 'storeRow'])
                    ->where('table', '[A-Za-z0-9_]+')->name('rows.store');
                Route::get('/tables/{table}/rows/{id}/edit', [DatabaseManagerController::class, 'editRow'])
                    ->where('table', '[A-Za-z0-9_]+')->name('rows.edit');
                Route::patch('/tables/{table}/rows/{id}', [DatabaseManagerController::class, 'updateRow'])
                    ->where('table', '[A-Za-z0-9_]+')->name('rows.update');
                Route::delete('/tables/{table}/rows/{id}', [DatabaseManagerController::class, 'destroyRow'])
                    ->where('table', '[A-Za-z0-9_]+')->name('rows.destroy');
            });
        });

        // ── Billing ────────────────────────────────────────────
        Route::prefix('billing')->name('billing.')->middleware('admin.permission:manage_billing')->group(function (): void {
            Route::get('/', BillingOverviewController::class)->name('index');
            Route::post('/enforcement', [BillingEnforcementController::class, 'update'])->name('enforcement.update');

            Route::prefix('plans')->name('plans.')->group(function (): void {
                Route::get('/', [BillingPlanController::class, 'index'])->name('index');
                Route::get('/create', [BillingPlanController::class, 'create'])->name('create');
                Route::post('/', [BillingPlanController::class, 'store'])->name('store');
                Route::get('/{plan}/edit', [BillingPlanController::class, 'edit'])->name('edit');
                Route::patch('/{plan}', [BillingPlanController::class, 'update'])->name('update');
                Route::delete('/{plan}', [BillingPlanController::class, 'destroy'])->name('destroy');
            });

            Route::post('/companies/{company}/demo', [CompanyDemoController::class, 'update'])
                ->name('companies.demo.update');
        });

        // ── Map Credits (Google API usage & allocation) ────────
        Route::prefix('map-credits')->name('map-credits.')->middleware('admin.permission:manage_billing')->group(function (): void {
            Route::get('/', [AdminMapCreditController::class, 'index'])->name('index');
            Route::post('/settings', [AdminMapCreditController::class, 'updateSettings'])->name('settings.update');
            Route::get('/companies/{company}', [AdminMapCreditController::class, 'show'])->name('companies.show');
            Route::post('/companies/{company}/adjust', [AdminMapCreditController::class, 'adjust'])->name('companies.adjust');

            Route::prefix('skus')->name('skus.')->group(function (): void {
                Route::get('/create', [AdminMapCreditSkuController::class, 'create'])->name('create');
                Route::post('/', [AdminMapCreditSkuController::class, 'store'])->name('store');
                Route::get('/{sku}/edit', [AdminMapCreditSkuController::class, 'edit'])->name('edit');
                Route::patch('/{sku}', [AdminMapCreditSkuController::class, 'update'])->name('update');
                Route::delete('/{sku}', [AdminMapCreditSkuController::class, 'destroy'])->name('destroy');
            });
        });

        // ── Map Display (Google business pins on the map) ──────
        Route::prefix('map-display')->name('map-display.')->middleware('admin.permission:manage_billing')->group(function (): void {
            Route::get('/', [AdminMapPoiDisplayController::class, 'index'])->name('index');
            Route::post('/global', [AdminMapPoiDisplayController::class, 'updateGlobal'])->name('global.update');
            Route::post('/companies/{company}', [AdminMapPoiDisplayController::class, 'updateCompany'])->name('companies.update');
        });
    });
});
