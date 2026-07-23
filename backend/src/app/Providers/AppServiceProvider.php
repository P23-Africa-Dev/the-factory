<?php

namespace App\Providers;

use App\Support\LoginRateLimiter;
use App\Models\Company;
use App\Models\Lead;
use App\Models\Task;
use App\Observers\LeadObserver;
use App\Observers\TaskObserver;
use App\Listeners\HandleStripeWebhook;
use Illuminate\Support\Facades\Event;
use Laravel\Cashier\Cashier;
use Laravel\Cashier\Events\WebhookReceived;
use Illuminate\Database\Console\Migrations\FreshCommand;
use Illuminate\Database\Console\Migrations\RefreshCommand;
use Illuminate\Database\Console\Migrations\ResetCommand;
use Illuminate\Database\Console\WipeCommand;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureLoginRateLimiting();
        $this->configureApiRateLimiting();

        if ($this->app->isProduction()) {
            FreshCommand::prohibit();
            RefreshCommand::prohibit();
            ResetCommand::prohibit();
            WipeCommand::prohibit();
        }

        $appUrlScheme = parse_url((string) config('app.url'), PHP_URL_SCHEME);

        if ($appUrlScheme === 'https') {
            URL::forceScheme('https');
        }

        Task::observe(TaskObserver::class);
        Lead::observe(LeadObserver::class);

        if (class_exists(Cashier::class) && class_exists(WebhookReceived::class)) {
            Cashier::useCustomerModel(Company::class);
            Cashier::ignoreRoutes();
            Event::listen(WebhookReceived::class, HandleStripeWebhook::class);
        }
    }

    private function configureLoginRateLimiting(): void
    {
        RateLimiter::for('login', function (Request $request) {
            $email = strtolower(trim((string) $request->input('email', '')));

            return Limit::perMinute(LoginRateLimiter::emailIpMaxAttempts())
                ->by($email . '|' . $request->ip());
        });

        RateLimiter::for('login-ip', function (Request $request) {
            return Limit::perMinute(LoginRateLimiter::ipMaxAttempts())->by($request->ip());
        });
    }

    private function configureApiRateLimiting(): void
    {
        $userOrIp = static fn (Request $request): string => (string) ($request->user()?->id ?: $request->ip());

        RateLimiter::for('api', function (Request $request) use ($userOrIp) {
            return Limit::perMinute((int) config('rate_limits.api_per_minute', 300))
                ->by($userOrIp($request));
        });

        RateLimiter::for('api-heavy', function (Request $request) use ($userOrIp) {
            return Limit::perMinute((int) config('rate_limits.api_heavy_per_minute', 600))
                ->by($userOrIp($request));
        });

        RateLimiter::for('auth-sensitive', function (Request $request) {
            return Limit::perMinute((int) config('rate_limits.auth_sensitive_per_minute', 30))
                ->by($request->ip());
        });

        RateLimiter::for('auth-register', function (Request $request) {
            return Limit::perMinute((int) config('rate_limits.auth_register_per_minute', 15))
                ->by($request->ip());
        });

        RateLimiter::for('auth-forgot-password', function (Request $request) {
            return Limit::perMinute((int) config('rate_limits.auth_forgot_password_per_minute', 15))
                ->by($request->ip());
        });

        RateLimiter::for('auth-resend-otp', function (Request $request) {
            return Limit::perMinutes(10, (int) config('rate_limits.auth_resend_otp_per_10_minutes', 5))
                ->by($request->ip());
        });

        RateLimiter::for('support-access', function (Request $request) {
            $adminId = auth('admin')->id();

            return Limit::perMinute(10)
                ->by((string) ($adminId ?: $request->ip()));
        });
    }
}
