<?php

use App\Http\Controllers\Api\V1\Agent\AgentLoginController;
use App\Http\Controllers\Api\V1\Attendance\AttendanceAgentController;
use App\Http\Controllers\Api\V1\Attendance\AttendanceManagementController;
use App\Http\Controllers\Api\V1\Attendance\AttendanceSettingsController;
use App\Http\Controllers\Api\V1\AI\CopilotAutomationController;
use App\Http\Controllers\Api\V1\AI\CopilotController;
use App\Http\Controllers\Api\V1\AI\CopilotReportingController;
use App\Http\Controllers\Api\V1\Auth\AdminLoginController;
use App\Http\Controllers\Api\V1\Auth\ForgotPasswordController;
use App\Http\Controllers\Api\V1\Auth\LogoutController;
use App\Http\Controllers\Api\V1\Auth\RegisterController;
use App\Http\Controllers\Api\V1\Auth\ResendOtpController;
use App\Http\Controllers\Api\V1\Auth\ResetPasswordController;
use App\Http\Controllers\Api\V1\Auth\VerifyEmailController;
use App\Http\Controllers\Api\V1\AvatarController;
use App\Http\Controllers\Api\V1\Calendar\CalendarIntegrationController;
use App\Http\Controllers\Api\V1\Calendar\MeetingController;
use App\Http\Controllers\Api\V1\Company\CompanyLocationController;
use App\Http\Controllers\Api\V1\CountryController;
use App\Http\Controllers\Api\V1\CurrencyController;
use App\Http\Controllers\Api\V1\Crm\LeadController;
use App\Http\Controllers\Api\V1\Dashboard\DashboardOverviewController;
use App\Http\Controllers\Api\V1\Enterprise\BookDemoController;
use App\Http\Controllers\Api\V1\Enterprise\CompleteFirstTimeSetupController;
use App\Http\Controllers\Api\V1\Enterprise\EnterpriseLoginController;
use App\Http\Controllers\Api\V1\Enterprise\SetupInfoController;
use App\Http\Controllers\Api\V1\Enterprise\VerifyCompanyIdController;
use App\Http\Controllers\Api\V1\HealthController;
use App\Http\Controllers\Api\V1\Kpi\AdminKpiStatusController;
use App\Http\Controllers\Api\V1\Kpi\KpiController;
use App\Http\Controllers\Api\V1\Kpi\KpiStatusController;
use App\Http\Controllers\Api\V1\Internal\InternalLoginController;
use App\Http\Controllers\Api\V1\Internal\InternalOnboardingController;
use App\Http\Controllers\Api\V1\Internal\InternalUserController;
use App\Http\Controllers\Api\V1\Map\MapProviderController;
use App\Http\Controllers\Api\V1\Notification\NotificationController;
use App\Http\Controllers\Api\V1\Notification\NotificationPreferenceController;
use App\Http\Controllers\Api\V1\Notification\PushSubscriptionController;
use App\Http\Controllers\Api\V1\Onboarding\WorkspaceController;
use App\Http\Controllers\Api\V1\Payroll\PayrollController;
use App\Http\Controllers\Api\V1\Project\ProjectController;
use App\Http\Controllers\Api\V1\Tracking\AgentLocationController;
use App\Http\Controllers\Api\V1\Tracking\AgentPresenceController;
use App\Http\Controllers\Api\V1\Task\AgentTaskController;
use App\Http\Controllers\Api\V1\Task\AdminTaskStatusController;
use App\Http\Controllers\Api\V1\Task\TaskAssignmentController;
use App\Http\Controllers\Api\V1\Task\TaskController;
use App\Http\Controllers\Api\V1\Task\TaskProofController;
use App\Http\Controllers\Api\V1\Task\TaskStatusController;
use App\Http\Controllers\Api\V1\Task\TaskTrackingController;
use App\Http\Controllers\Api\V1\User\MeController;
use App\Http\Controllers\Api\V1\User\ProfileController;
use App\Http\Controllers\Api\V1\Workforce\WorkforceSummaryController;
use Illuminate\Support\Facades\Route;

// Public
Route::get('/health', HealthController::class)->name('health');
Route::get('/avatars', [AvatarController::class, 'index'])
    ->middleware('throttle:30,1')
    ->name('avatars.index');
Route::get('/currencies', [CurrencyController::class, 'index'])
    ->middleware('throttle:60,1')
    ->name('currencies.index');
Route::get('/countries', [CountryController::class, 'index'])
    ->middleware('throttle:60,1')
    ->name('countries.index');
Route::get('/map/provider', MapProviderController::class)
    ->middleware('throttle:60,1')
    ->name('map.provider');
Route::get('/calendar/integration/callback', [CalendarIntegrationController::class, 'callback'])
    ->middleware('throttle:30,1')
    ->name('calendar.integration.callback');

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

    Route::get('/reset-password/{token}', [ResetPasswordController::class, 'validateToken'])
        ->middleware('throttle:20,1')
        ->name('reset-password.validate');

    Route::post('/reset-password', [ResetPasswordController::class, 'reset'])
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
Route::middleware(['auth:sanctum', 'account.active'])->group(function (): void {
    Route::post('/auth/logout', LogoutController::class)->name('auth.logout');

    Route::prefix('user')->name('user.')->group(function (): void {
        Route::get('/me', MeController::class)->name('me');
        Route::get('/profile', [ProfileController::class, 'show'])->name('profile.show');
        Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
        Route::post('/profile/avatar', [ProfileController::class, 'updateAvatar'])
            ->middleware('throttle:20,1')
            ->name('profile.avatar.update');
    });

    Route::prefix('copilot')->name('copilot.')->group(function (): void {
        Route::post('/chat', [CopilotController::class, 'chat'])
            ->middleware('throttle:20,1')
            ->name('chat');
        Route::get('/assignees', [CopilotController::class, 'assignees'])
            ->middleware('throttle:30,1')
            ->name('assignees.index');
        Route::get('/threads/search', [CopilotController::class, 'search'])
            ->middleware('throttle:30,1')
            ->name('threads.search');
        Route::get('/threads', [CopilotController::class, 'index'])->name('threads.index');
        Route::get('/threads/{thread}', [CopilotController::class, 'show'])->name('threads.show');
        Route::get('/threads/{thread}/messages', [CopilotController::class, 'messages'])->name('threads.messages.index');
        Route::delete('/threads/{thread}', [CopilotController::class, 'destroy'])->name('threads.destroy');

        Route::get('/analytics/context-pack', [CopilotReportingController::class, 'contextPack'])
            ->middleware('throttle:20,1')
            ->name('analytics.context-pack');

        Route::post('/reports/weekly-summary', [CopilotReportingController::class, 'queueWeeklySummary'])
            ->middleware('throttle:10,1')
            ->name('reports.weekly-summary.queue');
        Route::get('/reports/weekly-summary/{reportId}', [CopilotReportingController::class, 'weeklySummaryStatus'])
            ->name('reports.weekly-summary.status');
        Route::get('/reports/weekly-summary/{reportId}/download', [CopilotReportingController::class, 'downloadWeeklySummary'])
            ->name('reports.weekly-summary.download');

        Route::post('/automations/preview', [CopilotAutomationController::class, 'preview'])
            ->middleware('throttle:20,1')
            ->name('automations.preview');
        Route::post('/automations', [CopilotAutomationController::class, 'store'])
            ->middleware('throttle:20,1')
            ->name('automations.store');
        Route::get('/automations', [CopilotAutomationController::class, 'index'])
            ->name('automations.index');
        Route::post('/automations/{automation}/run', [CopilotAutomationController::class, 'run'])
            ->middleware('throttle:20,1')
            ->name('automations.run');

        Route::post('/voice/transcriptions', ['App\\Http\\Controllers\\Api\\V1\\AI\\CopilotInnovationController', 'transcribeVoice'])
            ->middleware('throttle:20,1')
            ->name('voice.transcriptions.store');
        Route::post('/files/analyze', ['App\\Http\\Controllers\\Api\\V1\\AI\\CopilotInnovationController', 'analyzeFile'])
            ->middleware('throttle:20,1')
            ->name('files.analyze');
        Route::post('/meetings/transcripts/summarize', ['App\\Http\\Controllers\\Api\\V1\\AI\\CopilotInnovationController', 'summarizeTranscript'])
            ->middleware('throttle:20,1')
            ->name('meetings.transcripts.summarize');
        Route::get('/forecast/overview', ['App\\Http\\Controllers\\Api\\V1\\AI\\CopilotInnovationController', 'forecastOverview'])
            ->middleware('throttle:20,1')
            ->name('forecast.overview');
    });

    Route::prefix('onboarding')->name('onboarding.')->group(function (): void {
        Route::post('/workspace', [WorkspaceController::class, 'store'])
            ->middleware('throttle:10,1')
            ->name('workspace');
    });

    Route::prefix('notifications')->name('notifications.')->group(function (): void {
        Route::get('/', [NotificationController::class, 'index'])->name('index');
        Route::get('/history', [NotificationController::class, 'history'])->name('history');
        Route::get('/unread-count', [NotificationController::class, 'unreadCount'])->name('unread-count');
        Route::patch('/read', [NotificationController::class, 'markRead'])->name('read');
        Route::patch('/unread', [NotificationController::class, 'markUnread'])->name('unread');
        Route::patch('/read-all', [NotificationController::class, 'markAllRead'])->name('read-all');
        Route::delete('/{notification}', [NotificationController::class, 'destroy'])->name('destroy');

        Route::get('/preferences', [NotificationPreferenceController::class, 'index'])->name('preferences.index');
        Route::put('/preferences', [NotificationPreferenceController::class, 'update'])->name('preferences.update');

        Route::get('/push-subscriptions', [PushSubscriptionController::class, 'index'])->name('push-subscriptions.index');
        Route::post('/push-subscriptions', [PushSubscriptionController::class, 'store'])->name('push-subscriptions.store');
        Route::post('/push-subscriptions/refresh', [PushSubscriptionController::class, 'refresh'])
            ->name('push-subscriptions.refresh');
        Route::delete('/push-subscriptions', [PushSubscriptionController::class, 'destroy'])
            ->name('push-subscriptions.destroy');
    });

    Route::prefix('calendar/integration')->name('calendar.integration.')->group(function (): void {
        Route::get('/status', [CalendarIntegrationController::class, 'status'])->name('status');
        Route::post('/connect-url', [CalendarIntegrationController::class, 'connectUrl'])
            ->middleware('throttle:20,1')
            ->name('connect-url');
        Route::post('/switch-url', [CalendarIntegrationController::class, 'switchUrl'])
            ->middleware('throttle:20,1')
            ->name('switch-url');
        Route::post('/reconnect-url', [CalendarIntegrationController::class, 'reconnectUrl'])
            ->middleware('throttle:20,1')
            ->name('reconnect-url');
        Route::delete('/disconnect', [CalendarIntegrationController::class, 'disconnect'])
            ->middleware('throttle:20,1')
            ->name('disconnect');
    });

    Route::prefix('meetings')->name('meetings.')->group(function (): void {
        Route::get('/', [MeetingController::class, 'index'])->name('index');
        Route::get('/attendees', [MeetingController::class, 'attendees'])
            ->middleware('throttle:30,1')
            ->name('attendees');
        Route::post('/', [MeetingController::class, 'store'])
            ->middleware('throttle:20,1')
            ->name('store');
        Route::get('/{meeting}', [MeetingController::class, 'show'])->name('show');
        Route::patch('/{meeting}', [MeetingController::class, 'update'])
            ->middleware('throttle:20,1')
            ->name('update');
        Route::post('/{meeting}/cancel', [MeetingController::class, 'cancel'])
            ->middleware('throttle:20,1')
            ->name('cancel');
        Route::delete('/{meeting}', [MeetingController::class, 'destroy'])
            ->middleware('throttle:20,1')
            ->name('destroy');
        Route::post('/{meeting}/resync', [MeetingController::class, 'resync'])
            ->middleware('throttle:20,1')
            ->name('resync');
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
                Route::get('/reassignments/inbox', [TaskAssignmentController::class, 'inbox'])->name('reassignments.inbox');
                Route::post('/reassignments/{reassignment}/accept', [TaskAssignmentController::class, 'accept'])
                    ->name('reassignments.accept');
                Route::post('/reassignments/{reassignment}/reject', [TaskAssignmentController::class, 'reject'])
                    ->name('reassignments.reject');
                Route::get('/{task}', [TaskController::class, 'show'])->name('show');
                Route::get('/{task}/route', [TaskTrackingController::class, 'route'])->name('route');
                Route::patch('/{task}/assign', [TaskAssignmentController::class, 'update'])->name('assign');
                Route::patch('/{task}/status', [AdminTaskStatusController::class, 'update'])->name('status.update');
                Route::get('/{task}/proofs/{proof}', [TaskProofController::class, 'show'])->name('proofs.show');
            });

            Route::prefix('kpis')->name('kpis.')->group(function (): void {
                Route::get('/', [KpiController::class, 'index'])->name('index');
                Route::post('/', [KpiController::class, 'store'])
                    ->middleware('throttle:30,1')
                    ->name('store');
                Route::get('/{kpi}', [KpiController::class, 'show'])->name('show');
                Route::patch('/{kpi}', [KpiController::class, 'update'])
                    ->middleware('throttle:30,1')
                    ->name('update');
                Route::delete('/{kpi}', [KpiController::class, 'destroy'])
                    ->middleware('throttle:20,1')
                    ->name('destroy');
                Route::patch('/{kpi}/status', [AdminKpiStatusController::class, 'update'])
                    ->middleware('throttle:30,1')
                    ->name('status.update');
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
                Route::get('/overview', [PayrollController::class, 'overview'])->name('overview');
                Route::get('/export', [PayrollController::class, 'export'])->name('export');
                Route::get('/agents', [PayrollController::class, 'agents'])->name('agents.index');
                Route::get('/agents/{user}', [PayrollController::class, 'agentProfile'])->name('agents.show');
                Route::patch('/agents/{user}', [PayrollController::class, 'updateAgentPayroll'])
                    ->middleware('throttle:20,1')
                    ->name('agents.update');
                Route::patch('/agents/{user}/approval', [PayrollController::class, 'approveAgentPayroll'])
                    ->middleware('throttle:20,1')
                    ->name('agents.approval');
                Route::post('/', [PayrollController::class, 'store'])
                    ->middleware('throttle:20,1')
                    ->name('store');
                Route::put('/{payrollSetting}', [PayrollController::class, 'update'])
                    ->middleware('throttle:20,1')
                    ->name('update');
            });

            Route::prefix('attendance')->name('attendance.')->group(function (): void {
                Route::get('/settings', [AttendanceSettingsController::class, 'show'])->name('settings.show');
                Route::put('/settings', [AttendanceSettingsController::class, 'update'])
                    ->middleware('throttle:20,1')
                    ->name('settings.update');
                Route::get('/metrics', [AttendanceManagementController::class, 'metrics'])->name('metrics');
                Route::get('/records', [AttendanceManagementController::class, 'index'])->name('records.index');
                Route::get('/agents/{agent}/history', [AttendanceManagementController::class, 'agentHistory'])
                    ->name('agents.history');
                Route::get('/payroll-summaries', [AttendanceManagementController::class, 'payrollSummaries'])
                    ->name('payroll-summaries.index');
                Route::post('/payroll-summaries/generate', [AttendanceManagementController::class, 'generatePayroll'])
                    ->middleware('throttle:20,1')
                    ->name('payroll-summaries.generate');
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

                Route::patch('/{user}', [InternalUserController::class, 'update'])
                    ->middleware('throttle:30,1')
                    ->name('update');

                Route::patch('/{user}/supervisor', [InternalUserController::class, 'assignSupervisor'])
                    ->middleware('throttle:30,1')
                    ->name('supervisor.assign');
            });

            Route::prefix('crm')->name('crm.')->group(function (): void {
                Route::get('/leads', [LeadController::class, 'index'])->name('leads.index');
                Route::post('/leads', [LeadController::class, 'store'])
                    ->middleware('throttle:30,1')
                    ->name('leads.store');
                Route::post('/leads/import', [LeadController::class, 'import'])
                    ->middleware('throttle:20,1')
                    ->name('leads.import');
                Route::get('/leads/pipeline', [LeadController::class, 'pipeline'])->name('leads.pipeline');
                Route::get('/leads/analytics', [LeadController::class, 'leadsAnalytics'])->name('leads.analytics');
                Route::get('/leads/agent-uploads-overview', [LeadController::class, 'agentUploadsOverview'])->name('leads.agent-uploads-overview');
                Route::get('/pipelines', [LeadController::class, 'pipelines'])->name('pipelines.index');
                Route::post('/pipelines', [LeadController::class, 'storePipeline'])
                    ->middleware('throttle:20,1')
                    ->name('pipelines.store');
                Route::patch('/pipelines/{pipeline}', [LeadController::class, 'updatePipeline'])
                    ->middleware('throttle:20,1')
                    ->name('pipelines.update');
                Route::get('/labels', [LeadController::class, 'labels'])->name('labels.index');
                Route::post('/labels', [LeadController::class, 'storeLabel'])
                    ->middleware('throttle:20,1')
                    ->name('labels.store');
                Route::patch('/labels/{label}', [LeadController::class, 'updateLabel'])
                    ->middleware('throttle:20,1')
                    ->name('labels.update');
                Route::post('/labels/{label}/delete', [LeadController::class, 'deleteLabel'])
                    ->middleware('throttle:20,1')
                    ->name('labels.delete');
                Route::post('/labels/reorder', [LeadController::class, 'reorderLabels'])
                    ->middleware('throttle:20,1')
                    ->name('labels.reorder');
                Route::get('/leads/{lead}', [LeadController::class, 'show'])->name('leads.show');
                Route::patch('/leads/{lead}', [LeadController::class, 'update'])
                    ->middleware('throttle:30,1')
                    ->name('leads.update');
                Route::delete('/leads/{lead}', [LeadController::class, 'destroy'])
                    ->middleware('throttle:20,1')
                    ->name('leads.destroy');
                Route::post('/leads/{lead}/notes', [LeadController::class, 'storeNote'])
                    ->middleware('throttle:60,1')
                    ->name('leads.notes.store');
                Route::post('/leads/{lead}/activities', [LeadController::class, 'storeActivity'])
                    ->middleware('throttle:60,1')
                    ->name('leads.activities.store');
            });

            Route::prefix('locations')->name('locations.')->group(function (): void {
                Route::get('/', [CompanyLocationController::class, 'index'])->name('index');
                Route::post('/', [CompanyLocationController::class, 'store'])
                    ->middleware('throttle:30,1')
                    ->name('store');
                Route::get('/{location}', [CompanyLocationController::class, 'show'])->name('show');
                Route::patch('/{location}', [CompanyLocationController::class, 'update'])
                    ->middleware('throttle:30,1')
                    ->name('update');
                Route::delete('/{location}', [CompanyLocationController::class, 'destroy'])
                    ->middleware('throttle:30,1')
                    ->name('destroy');
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
                Route::get('/{project}', [ProjectController::class, 'agentShow'])->name('show');
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

            Route::prefix('kpis')->name('kpis.')->group(function (): void {
                Route::get('/', [KpiController::class, 'index'])->name('index');
                Route::get('/{kpi}', [KpiController::class, 'show'])->name('show');
                Route::patch('/{kpi}/status', [KpiStatusController::class, 'update'])
                    ->middleware('throttle:30,1')
                    ->name('status.update');
            });

            Route::prefix('crm')->name('crm.')->group(function (): void {
                Route::get('/leads', [LeadController::class, 'index'])->name('leads.index');
                Route::post('/leads', [LeadController::class, 'store'])
                    ->middleware('throttle:30,1')
                    ->name('leads.store');
                Route::post('/leads/import', [LeadController::class, 'import'])
                    ->middleware('throttle:20,1')
                    ->name('leads.import');
                Route::get('/leads/pipeline', [LeadController::class, 'pipeline'])->name('leads.pipeline');
                Route::get('/leads/analytics', [LeadController::class, 'leadsAnalytics'])->name('leads.analytics');
                Route::get('/leads/agent-uploads-overview', [LeadController::class, 'agentUploadsOverview'])->name('leads.agent-uploads-overview');
                Route::get('/pipelines', [LeadController::class, 'pipelines'])->name('pipelines.index');
                Route::get('/labels', [LeadController::class, 'labels'])->name('labels.index');
                Route::get('/leads/{lead}', [LeadController::class, 'show'])->name('leads.show');
                Route::patch('/leads/{lead}', [LeadController::class, 'update'])
                    ->middleware('throttle:30,1')
                    ->name('leads.update');
                Route::delete('/leads/{lead}', [LeadController::class, 'destroy'])
                    ->middleware('throttle:20,1')
                    ->name('leads.destroy');
                Route::post('/leads/{lead}/notes', [LeadController::class, 'storeNote'])
                    ->middleware('throttle:60,1')
                    ->name('leads.notes.store');
                Route::post('/leads/{lead}/activities', [LeadController::class, 'storeActivity'])
                    ->middleware('throttle:60,1')
                    ->name('leads.activities.store');
            });

            Route::prefix('locations')->name('locations.')->group(function (): void {
                Route::get('/', [CompanyLocationController::class, 'index'])->name('index');
                Route::post('/', [CompanyLocationController::class, 'store'])
                    ->middleware('throttle:30,1')
                    ->name('store');
                Route::get('/{location}', [CompanyLocationController::class, 'show'])->name('show');
            });

            Route::prefix('attendance')->name('attendance.')->group(function (): void {
                Route::get('/today', [AttendanceAgentController::class, 'today'])->name('today');
                Route::post('/clock-in', [AttendanceAgentController::class, 'clockIn'])
                    ->middleware('throttle:20,1')
                    ->name('clock-in');
                Route::post('/clock-out', [AttendanceAgentController::class, 'clockOut'])
                    ->middleware('throttle:20,1')
                    ->name('clock-out');
                Route::get('/history', [AttendanceAgentController::class, 'history'])->name('history');
                Route::get('/stats', [AttendanceAgentController::class, 'stats'])->name('stats');
                Route::get('/payroll-summary', [AttendanceAgentController::class, 'payrollSummary'])
                    ->name('payroll-summary');
            });

            Route::get('/dashboard/overview', DashboardOverviewController::class)
                ->name('dashboard.overview');

            Route::get('/workforce/summary', WorkforceSummaryController::class)
                ->name('workforce.summary');

            Route::post('/presence/heartbeat', [AgentPresenceController::class, 'heartbeat'])
                ->middleware('throttle:120,1')
                ->name('presence.heartbeat');

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
        Route::get('/reassignments/inbox', [TaskAssignmentController::class, 'inbox'])->name('reassignments.inbox');
        Route::post('/reassignments/{reassignment}/accept', [TaskAssignmentController::class, 'accept'])
            ->name('reassignments.accept');
        Route::post('/reassignments/{reassignment}/reject', [TaskAssignmentController::class, 'reject'])
            ->name('reassignments.reject');
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

    Route::prefix('kpis')->name('kpis.')->group(function (): void {
        Route::get('/', [KpiController::class, 'index'])->name('index');
        Route::post('/', [KpiController::class, 'store'])
            ->middleware('throttle:30,1')
            ->name('store');
        Route::get('/{kpi}', [KpiController::class, 'show'])->name('show');
        Route::patch('/{kpi}', [KpiController::class, 'update'])
            ->middleware('throttle:30,1')
            ->name('update');
        Route::delete('/{kpi}', [KpiController::class, 'destroy'])
            ->middleware('throttle:20,1')
            ->name('destroy');
        Route::patch('/{kpi}/status', [KpiStatusController::class, 'update'])
            ->middleware('throttle:30,1')
            ->name('status.update');
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
        Route::get('/overview', [PayrollController::class, 'overview'])->name('overview');
        Route::get('/export', [PayrollController::class, 'export'])
            ->middleware('access.role:management')
            ->name('export');
        Route::get('/agents', [PayrollController::class, 'agents'])->name('agents.index');
        Route::get('/agents/{user}', [PayrollController::class, 'agentProfile'])->name('agents.show');
        Route::patch('/agents/{user}', [PayrollController::class, 'updateAgentPayroll'])
            ->middleware(['access.role:management', 'throttle:20,1'])
            ->name('agents.update');
        Route::patch('/agents/{user}/approval', [PayrollController::class, 'approveAgentPayroll'])
            ->middleware(['access.role:management', 'throttle:20,1'])
            ->name('agents.approval');
        Route::post('/', [PayrollController::class, 'store'])
            ->middleware('throttle:20,1')
            ->name('store');
        Route::put('/{payrollSetting}', [PayrollController::class, 'update'])
            ->middleware('throttle:20,1')
            ->name('update');
    });

    Route::prefix('attendance')->name('attendance.')->group(function (): void {
        Route::get('/settings', [AttendanceSettingsController::class, 'show'])
            ->middleware('access.role:management')
            ->name('settings.show');
        Route::put('/settings', [AttendanceSettingsController::class, 'update'])
            ->middleware(['access.role:management', 'throttle:20,1'])
            ->name('settings.update');
        Route::get('/metrics', [AttendanceManagementController::class, 'metrics'])
            ->middleware('access.role:management')
            ->name('metrics');
        Route::get('/records', [AttendanceManagementController::class, 'index'])
            ->middleware('access.role:management')
            ->name('records.index');
        Route::get('/agents/{agent}/history', [AttendanceManagementController::class, 'agentHistory'])
            ->middleware('access.role:management')
            ->name('agents.history');
        Route::get('/payroll-summaries', [AttendanceManagementController::class, 'payrollSummaries'])
            ->middleware('access.role:management')
            ->name('payroll-summaries.index');
        Route::post('/payroll-summaries/generate', [AttendanceManagementController::class, 'generatePayroll'])
            ->middleware(['access.role:management', 'throttle:20,1'])
            ->name('payroll-summaries.generate');

        Route::get('/today', [AttendanceAgentController::class, 'today'])
            ->middleware('access.role:agent')
            ->name('today');
        Route::post('/clock-in', [AttendanceAgentController::class, 'clockIn'])
            ->middleware(['access.role:agent', 'throttle:20,1'])
            ->name('clock-in');
        Route::post('/clock-out', [AttendanceAgentController::class, 'clockOut'])
            ->middleware(['access.role:agent', 'throttle:20,1'])
            ->name('clock-out');
        Route::get('/history', [AttendanceAgentController::class, 'history'])
            ->middleware('access.role:agent')
            ->name('history');
        Route::get('/stats', [AttendanceAgentController::class, 'stats'])
            ->middleware('access.role:agent')
            ->name('stats');
        Route::get('/payroll-summary', [AttendanceAgentController::class, 'payrollSummary'])
            ->middleware('access.role:agent')
            ->name('payroll-summary');
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

        Route::patch('/{user}', [InternalUserController::class, 'update'])
            ->middleware('throttle:30,1')
            ->name('update');

        Route::patch('/{user}/supervisor', [InternalUserController::class, 'assignSupervisor'])
            ->middleware('throttle:30,1')
            ->name('supervisor.assign');
    });

    Route::prefix('crm')->name('crm.')->group(function (): void {
        Route::get('/leads', [LeadController::class, 'index'])->name('leads.index');
        Route::post('/leads', [LeadController::class, 'store'])
            ->middleware('throttle:30,1')
            ->name('leads.store');
        Route::post('/leads/import', [LeadController::class, 'import'])
            ->middleware('throttle:20,1')
            ->name('leads.import');
        Route::get('/leads/pipeline', [LeadController::class, 'pipeline'])->name('leads.pipeline');
        Route::get('/leads/analytics', [LeadController::class, 'leadsAnalytics'])->name('leads.analytics');
        Route::get('/leads/agent-uploads-overview', [LeadController::class, 'agentUploadsOverview'])->name('leads.agent-uploads-overview');
        Route::get('/pipelines', [LeadController::class, 'pipelines'])->name('pipelines.index');
        Route::post('/pipelines', [LeadController::class, 'storePipeline'])
            ->middleware('throttle:20,1')
            ->name('pipelines.store');
        Route::patch('/pipelines/{pipeline}', [LeadController::class, 'updatePipeline'])
            ->middleware('throttle:20,1')
            ->name('pipelines.update');
        Route::get('/labels', [LeadController::class, 'labels'])->name('labels.index');
        Route::post('/labels', [LeadController::class, 'storeLabel'])
            ->middleware('throttle:20,1')
            ->name('labels.store');
        Route::patch('/labels/{label}', [LeadController::class, 'updateLabel'])
            ->middleware('throttle:20,1')
            ->name('labels.update');
        Route::post('/labels/{label}/delete', [LeadController::class, 'deleteLabel'])
            ->middleware(['access.role:management', 'throttle:20,1'])
            ->name('labels.delete');
        Route::post('/labels/reorder', [LeadController::class, 'reorderLabels'])
            ->middleware('throttle:20,1')
            ->name('labels.reorder');
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
