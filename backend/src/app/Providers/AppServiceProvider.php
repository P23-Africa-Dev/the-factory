<?php

namespace App\Providers;

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
}
