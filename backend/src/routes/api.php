<?php

use App\Http\Controllers\Api\V1\Agent\AgentLoginController;
use App\Http\Controllers\Api\V1\Auth\AdminLoginController;
use App\Http\Controllers\Api\V1\Auth\ForgotPasswordController;
use App\Http\Controllers\Api\V1\Auth\LogoutController;
use App\Http\Controllers\Api\V1\Auth\RegisterController;
use App\Http\Controllers\Api\V1\Auth\ResendOtpController;
use App\Http\Controllers\Api\V1\Auth\ResetPasswordController;
use App\Http\Controllers\Api\V1\Auth\VerifyEmailController;
use App\Http\Controllers\Api\V1\AvatarController;
use App\Http\Controllers\Api\V1\Crm\LeadController;
use App\Http\Controllers\Api\V1\Dashboard\DashboardOverviewController;
use App\Http\Controllers\Api\V1\Enterprise\BookDemoController;
use App\Http\Controllers\Api\V1\Enterprise\CompleteFirstTimeSetupController;
use App\Http\Controllers\Api\V1\Enterprise\EnterpriseLoginController;
use App\Http\Controllers\Api\V1\Enterprise\SetupInfoController;
use App\Http\Controllers\Api\V1\Enterprise\VerifyCompanyIdController;
use App\Http\Controllers\Api\V1\HealthController;
use App\Http\Controllers\Api\V1\Internal\InternalLoginController;
use App\Http\Controllers\Api\V1\Internal\InternalOnboardingController;
use App\Http\Controllers\Api\V1\Internal\InternalUserController;
use App\Http\Controllers\Api\V1\Onboarding\WorkspaceController;
use App\Http\Controllers\Api\V1\Payroll\PayrollController;
use App\Http\Controllers\Api\V1\Project\ProjectController;
use App\Http\Controllers\Api\V1\Tracking\AgentLocationController;
use App\Http\Controllers\Api\V1\Task\AgentTaskController;
use App\Http\Controllers\Api\V1\Task\AdminTaskStatusController;
use App\Http\Controllers\Api\V1\Task\TaskAssignmentController;
use App\Http\Controllers\Api\V1\Task\TaskController;
use App\Http\Controllers\Api\V1\Task\TaskProofController;
use App\Http\Controllers\Api\V1\Task\TaskStatusController;
use App\Http\Controllers\Api\V1\Task\TaskTrackingController;
use App\Http\Controllers\Api\V1\User\MeController;
use App\Http\Controllers\Api\V1\Workforce\WorkforceSummaryController;
use Illuminate\Support\Facades\Route;

// Public
Route::get('/health', HealthController::class)->name('health');
Route::get('/avatars', [AvatarController::class, 'index'])
    ->middleware('throttle:30,1')
    ->name('avatars.index');

Route::prefix('auth')->name('auth.')->group(function (): void {
    Route::post('/register', RegisterController::class)
        ->middleware('throttle:5,1')
        ->name('register');

    Route::post('/verify-email', VerifyEmailController::class)
        ->middleware('throttle:10,1')
        ->name('verify-email');

    Route::post('/resend-otp', ResendOtpController::class)
        ->middleware('throttle:3,10')
        ->name('resend-otp');

    Route::post('/forgot-password', ForgotPasswordController::class)
        ->middleware('throttle:5,1')
        ->name('forgot-password');

    Route::post('/reset-password', ResetPasswordController::class)
        ->middleware('throttle:10,1')
        ->name('reset-password');

    // Unified admin login for self-serve and enterprise users
    Route::post('/login', AdminLoginController::class)
        ->middleware('throttle:10,1')
        ->name('login');
});

Route::prefix('enterprise')->name('enterprise.')->group(function (): void {
    Route::post('/demo-requests', BookDemoController::class)
        ->middleware('throttle:10,1')
        ->name('demo-requests.store');

    Route::post('/onboarding/verify-company-id', VerifyCompanyIdController::class)
        ->middleware('throttle:20,1')
        ->name('onboarding.verify-company-id');

    Route::get('/onboarding/setup-info', SetupInfoController::class)
        ->middleware('throttle:20,1')
        ->name('onboarding.setup-info');

    Route::post('/onboarding/complete', CompleteFirstTimeSetupController::class)
        ->middleware('throttle:10,1')
        ->name('onboarding.complete');

    // Deprecated: Use /api/auth/login instead
    Route::post('/login', EnterpriseLoginController::class)
        ->middleware('throttle:10,1')
        ->name('login');
});

Route::prefix('agent')->name('agent.')->group(function (): void {
    Route::post('/login', AgentLoginController::class)
        ->middleware('throttle:10,1')
        ->name('login');
});

Route::prefix('internal')->name('internal.')->group(function (): void {
    // Deprecated: use /api/v1/agent/login.
    Route::post('/login', InternalLoginController::class)
        ->middleware('throttle:10,1')
        ->name('login');

    Route::post('/onboarding/preview', [InternalOnboardingController::class, 'preview'])
        ->middleware('throttle:30,1')
        ->name('onboarding.preview');

    Route::post('/onboarding/complete', [InternalOnboardingController::class, 'complete'])
        ->middleware('throttle:10,1')
        ->name('onboarding.complete');
});

// Authenticated
Route::middleware('auth:sanctum')->group(function (): void {
    Route::post('/auth/logout', LogoutController::class)->name('auth.logout');

    Route::prefix('user')->name('user.')->group(function (): void {
        Route::get('/me', MeController::class)->name('me');
    });

    Route::prefix('onboarding')->name('onboarding.')->group(function (): void {
        Route::post('/workspace', [WorkspaceController::class, 'store'])
            ->middleware('throttle:10,1')
            ->name('workspace');
    });

    // Canonical management endpoints.
    Route::prefix('admin')
        ->name('admin-api.')
        ->middleware('access.role:management')
        ->group(function (): void {
            Route::prefix('tasks')->name('tasks.')->group(function (): void {
                Route::get('/', [TaskController::class, 'index'])->name('index');
                Route::post('/', [TaskController::class, 'store'])
                    ->middleware('throttle:30,1')
                    ->name('store');
                Route::get('/{task}', [TaskController::class, 'show'])->name('show');
                Route::get('/{task}/route', [TaskTrackingController::class, 'route'])->name('route');
                Route::patch('/{task}/assign', [TaskAssignmentController::class, 'update'])->name('assign');
                Route::patch('/{task}/status', [AdminTaskStatusController::class, 'update'])->name('status.update');
                Route::get('/{task}/proofs/{proof}', [TaskProofController::class, 'show'])->name('proofs.show');
            });

            Route::prefix('projects')->name('projects.')->group(function (): void {
                Route::get('/', [ProjectController::class, 'index'])->name('index');
                Route::post('/', [ProjectController::class, 'store'])
                    ->middleware('throttle:20,1')
                    ->name('store');
                Route::get('/{project}', [ProjectController::class, 'show'])->name('show');
                Route::patch('/{project}', [ProjectController::class, 'update'])
                    ->middleware('throttle:20,1')
                    ->name('update');
            });

            Route::prefix('payroll')->name('payroll.')->group(function (): void {
                Route::get('/', [PayrollController::class, 'index'])->name('index');
                Route::post('/', [PayrollController::class, 'store'])
                    ->middleware('throttle:20,1')
                    ->name('store');
                Route::put('/{payrollSetting}', [PayrollController::class, 'update'])
                    ->middleware('throttle:20,1')
                    ->name('update');
            });

            Route::prefix('internal-users')->name('internal-users.')->group(function (): void {
                Route::get('/', [InternalUserController::class, 'index'])
                    ->middleware('throttle:30,1')
                    ->name('index');

                Route::get('/onboarding-status', [InternalUserController::class, 'onboardingStatus'])
                    ->middleware('throttle:30,1')
                    ->name('onboarding-status');

                Route::post('/', [InternalUserController::class, 'store'])
                    ->middleware('throttle:20,1')
                    ->name('store');

                Route::post('/{user}/invite', [InternalUserController::class, 'resendInvite'])
                    ->middleware('throttle:20,1')
                    ->name('invite');

                Route::patch('/{user}/supervisor', [InternalUserController::class, 'assignSupervisor'])
                    ->middleware('throttle:30,1')
                    ->name('supervisor.assign');
            });

            Route::prefix('crm')->name('crm.')->group(function (): void {
                Route::get('/leads', [LeadController::class, 'index'])->name('leads.index');
                Route::post('/leads', [LeadController::class, 'store'])
                    ->middleware('throttle:30,1')
                    ->name('leads.store');
                Route::get('/leads/pipeline', [LeadController::class, 'pipeline'])->name('leads.pipeline');
                Route::get('/leads/{lead}', [LeadController::class, 'show'])->name('leads.show');
                Route::patch('/leads/{lead}', [LeadController::class, 'update'])
                    ->middleware('throttle:30,1')
                    ->name('leads.update');
                Route::post('/leads/{lead}/notes', [LeadController::class, 'storeNote'])
                    ->middleware('throttle:60,1')
                    ->name('leads.notes.store');
                Route::post('/leads/{lead}/activities', [LeadController::class, 'storeActivity'])
                    ->middleware('throttle:60,1')
                    ->name('leads.activities.store');
            });

            Route::get('/dashboard/overview', DashboardOverviewController::class)
                ->name('dashboard.overview');

            Route::get('/workforce/summary', WorkforceSummaryController::class)
                ->name('workforce.summary');

            Route::prefix('agents')->name('agents.')->group(function (): void {
                Route::get('/locations', [AgentLocationController::class, 'index'])->name('locations.index');
                Route::get('/{user}/location', [AgentLocationController::class, 'show'])->name('locations.show');
            });
        });

    // Canonical agent endpoints.
    Route::prefix('agent')
        ->name('agent-api.')
        ->middleware('access.role:agent')
        ->group(function (): void {
            Route::prefix('projects')->name('projects.')->group(function (): void {
                Route::get('/', [ProjectController::class, 'agentIndex'])->name('index');
            });

            Route::prefix('tasks')->name('tasks.')->group(function (): void {
                Route::get('/', [TaskController::class, 'index'])->name('index');
                Route::post('/self', [AgentTaskController::class, 'storeSelf'])
                    ->middleware('throttle:30,1')
                    ->name('self.store');
                Route::get('/{task}', [TaskController::class, 'show'])->name('show');
                Route::get('/{task}/route', [TaskTrackingController::class, 'route'])->name('route');
                Route::post('/{task}/start', [TaskTrackingController::class, 'start'])->name('start');
                Route::post('/{task}/location', [TaskTrackingController::class, 'location'])->name('location');
                Route::post('/{task}/complete', [TaskTrackingController::class, 'complete'])->name('complete');
                Route::patch('/{task}/status', [TaskStatusController::class, 'update'])->name('status.update');
                Route::post('/{task}/proofs', [TaskProofController::class, 'store'])
                    ->middleware('throttle:60,1')
                    ->name('proofs.store');
            });

            Route::prefix('crm')->name('crm.')->group(function (): void {
                Route::get('/leads', [LeadController::class, 'index'])->name('leads.index');
                Route::get('/leads/pipeline', [LeadController::class, 'pipeline'])->name('leads.pipeline');
                Route::get('/leads/{lead}', [LeadController::class, 'show'])->name('leads.show');
                Route::post('/leads/{lead}/notes', [LeadController::class, 'storeNote'])
                    ->middleware('throttle:60,1')
                    ->name('leads.notes.store');
                Route::post('/leads/{lead}/activities', [LeadController::class, 'storeActivity'])
                    ->middleware('throttle:60,1')
                    ->name('leads.activities.store');
            });

            Route::get('/dashboard/overview', DashboardOverviewController::class)
                ->name('dashboard.overview');

            Route::get('/workforce/summary', WorkforceSummaryController::class)
                ->name('workforce.summary');

            Route::prefix('agents')->name('agents.')->group(function (): void {
                Route::get('/locations', [AgentLocationController::class, 'index'])->name('locations.index');
                Route::get('/{user}/location', [AgentLocationController::class, 'show'])->name('locations.show');
            });
        });

    Route::prefix('tasks')->name('tasks.')->group(function (): void {
        Route::get('/', [TaskController::class, 'index'])->name('index');
        Route::post('/', [TaskController::class, 'store'])
            ->middleware('throttle:30,1')
            ->name('store');
        Route::get('/{task}', [TaskController::class, 'show'])->name('show');
        Route::get('/{task}/route', [TaskTrackingController::class, 'route'])->name('route');
        Route::post('/{task}/start', [TaskTrackingController::class, 'start'])->name('start');
        Route::post('/{task}/location', [TaskTrackingController::class, 'location'])->name('location');
        Route::post('/{task}/complete', [TaskTrackingController::class, 'complete'])->name('complete');
        Route::patch('/{task}/assign', [TaskAssignmentController::class, 'update'])->name('assign');
        Route::patch('/{task}/status', [TaskStatusController::class, 'update'])->name('status.update');
        Route::post('/{task}/proofs', [TaskProofController::class, 'store'])
            ->middleware('throttle:60,1')
            ->name('proofs.store');
        Route::get('/{task}/proofs/{proof}', [TaskProofController::class, 'show'])
            ->name('proofs.show');
    });

    Route::prefix('agent/tasks')->name('agent.tasks.')->group(function (): void {
        Route::post('/self', [AgentTaskController::class, 'storeSelf'])
            ->middleware('access.role:agent')
            ->middleware('throttle:30,1')
            ->name('self.store');
    });

    Route::prefix('projects')->name('projects.')->group(function (): void {
        Route::get('/', [ProjectController::class, 'index'])->name('index');
        Route::post('/', [ProjectController::class, 'store'])
            ->middleware('throttle:20,1')
            ->name('store');
        Route::get('/{project}', [ProjectController::class, 'show'])->name('show');
        Route::patch('/{project}', [ProjectController::class, 'update'])
            ->middleware('throttle:20,1')
            ->name('update');
    });

    Route::prefix('payroll')->name('payroll.')->group(function (): void {
        Route::get('/', [PayrollController::class, 'index'])->name('index');
        Route::post('/', [PayrollController::class, 'store'])
            ->middleware('throttle:20,1')
            ->name('store');
        Route::put('/{payrollSetting}', [PayrollController::class, 'update'])
            ->middleware('throttle:20,1')
            ->name('update');
    });

    Route::prefix('internal-users')->name('internal-users.')->group(function (): void {
        Route::get('/', [InternalUserController::class, 'index'])
            ->middleware('throttle:30,1')
            ->name('index');

        Route::get('/onboarding-status', [InternalUserController::class, 'onboardingStatus'])
            ->middleware('throttle:30,1')
            ->name('onboarding-status');

        Route::post('/', [InternalUserController::class, 'store'])
            ->middleware('throttle:20,1')
            ->name('store');

        Route::post('/{user}/invite', [InternalUserController::class, 'resendInvite'])
            ->middleware('throttle:20,1')
            ->name('invite');

        Route::patch('/{user}/supervisor', [InternalUserController::class, 'assignSupervisor'])
            ->middleware('throttle:30,1')
            ->name('supervisor.assign');
    });

    Route::prefix('crm')->name('crm.')->group(function (): void {
        Route::get('/leads', [LeadController::class, 'index'])->name('leads.index');
        Route::post('/leads', [LeadController::class, 'store'])
            ->middleware('throttle:30,1')
            ->name('leads.store');
        Route::get('/leads/pipeline', [LeadController::class, 'pipeline'])->name('leads.pipeline');
        Route::get('/leads/{lead}', [LeadController::class, 'show'])->name('leads.show');
        Route::patch('/leads/{lead}', [LeadController::class, 'update'])
            ->middleware('throttle:30,1')
            ->name('leads.update');
        Route::post('/leads/{lead}/notes', [LeadController::class, 'storeNote'])
            ->middleware('throttle:60,1')
            ->name('leads.notes.store');
        Route::post('/leads/{lead}/activities', [LeadController::class, 'storeActivity'])
            ->middleware('throttle:60,1')
            ->name('leads.activities.store');
    });

    Route::get('/dashboard/overview', DashboardOverviewController::class)
        ->name('dashboard.overview');

    Route::get('/workforce/summary', WorkforceSummaryController::class)
        ->name('workforce.summary');

    Route::prefix('agents')->name('agents.')->group(function (): void {
        Route::get('/locations', [AgentLocationController::class, 'index'])->name('locations.index');
        Route::get('/{user}/location', [AgentLocationController::class, 'show'])->name('locations.show');
    });
});
