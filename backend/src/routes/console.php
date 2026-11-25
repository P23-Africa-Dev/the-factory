<?php

use App\Notifications\SmtpConnectionTestNotification;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('mail:test {email} {--queued : Queue the email instead of sending immediately}', function () {
    $email = (string) $this->argument('email');
    $notification = new SmtpConnectionTestNotification((string) config('app.env'));

    if ((bool) $this->option('queued')) {
        Notification::route('mail', $email)->notify($notification);
        $this->info('SMTP test email queued for ' . $email);

        return 0;
    }

    Notification::route('mail', $email)->notifyNow($notification);
    $this->info('SMTP test email sent synchronously to ' . $email);

    return 0;
})->purpose('Send a production-mailer test email (sync by default, optionally queued).');

// Automatically lift expired user suspensions every day at midnight.
Schedule::command('users:lift-expired-suspensions')->daily();

// Prune old tracking traces while retaining recent and checkpoint data.
Schedule::command('tracking:prune')->dailyAt('02:00');

// Auto-close abandoned open tracking sessions so presence/map stay accurate.
Schedule::command('tracking:sweep-abandoned')->everyFifteenMinutes();

// Monitor the tracking pipeline (relay up, Redis ready, socket auth failures,
// abandoned sessions). Logs [tracking-alert] errors; emails TRACKING_ALERT_EMAILS if set.
Schedule::command('tracking:health --notify')->everyFiveMinutes()->withoutOverlapping();

// Dispatch due soon, overdue, and project deadline notification reminders.
Schedule::command('notifications:dispatch-scheduled')->everyFifteenMinutes();

// Run ELY automation rules with a daily or weekly schedule.
Schedule::command('ely:run-scheduled-automations')->everyFiveMinutes()->withoutOverlapping();

// Dispatch due meeting reminders every minute.
Schedule::command('meetings:dispatch-reminders')->everyMinute();

// Auto close attendance records at/after configured company closing times.
Schedule::command('attendance:auto-clockout')->everyTenMinutes();

// Field Activity Intelligence: EOD close, alerts, optional narratives.
Schedule::command('field-activity:eod --narrative')->hourly();

// Prune old field activity trails.
Schedule::command('field-activity:prune')->dailyAt('02:30');

// Generate attendance payroll summaries for the previous month.
Schedule::command('attendance:generate-monthly-payroll')->monthlyOn(1, '00:30');

// Remove ELY-generated Drive files (weekly reports) after their 60-day retention.
Schedule::command('drive:prune-expired')->dailyAt('03:15')->withoutOverlapping();

// Prune AI logs older than 30 days every day at 03:00.
Schedule::command('ai:prune-logs --days=30')->dailyAt('03:00');
Schedule::command('ai:health-check')->everyTenMinutes();

// Incremental email sync for CRM email conversations (all providers).
Schedule::command('crm:sync-gmail')->everyTenMinutes();

Schedule::command('billing:process-subscriptions')->dailyAt('01:00');

// Reset monthly plan-allocated map credits when a company's credit cycle ends.
Schedule::command('credits:reset-cycles')->dailyAt('00:15');
