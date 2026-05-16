<?php

namespace App\Providers;

use App\Models\Lead;
use App\Models\Task;
use App\Observers\LeadObserver;
use App\Observers\TaskObserver;
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
        $appUrlScheme = parse_url((string) config('app.url'), PHP_URL_SCHEME);

        if ($appUrlScheme === 'https') {
            URL::forceScheme('https');
        }

        Task::observe(TaskObserver::class);
        Lead::observe(LeadObserver::class);
    }
}
