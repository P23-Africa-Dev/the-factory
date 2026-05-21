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

// Dispatch due soon, overdue, and project deadline notification reminders.
Schedule::command('notifications:dispatch-scheduled')->everyFifteenMinutes();
