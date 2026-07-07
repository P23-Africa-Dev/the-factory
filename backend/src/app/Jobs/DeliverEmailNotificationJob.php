<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Mail\OperationalReminderMail;
use App\Models\AppNotification;
use App\Models\Company;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Mail;

class DeliverEmailNotificationJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 3;

    public array $backoff = [30, 120, 300];

    public function __construct(
        public readonly int $notificationId,
        public readonly int $userId,
    ) {
        $this->onQueue('notifications-email');
    }

    public function handle(): void
    {
        $notification = AppNotification::query()->find($this->notificationId);
        $user = User::query()->find($this->userId);

        if (! $notification || ! $user) {
            return;
        }

        $email = trim((string) ($user->email ?? ''));
        if ($email === '') {
            return;
        }

        $companyName = 'your organization';
        if ($notification->company_id !== null) {
            $companyName = (string) (Company::query()->find((int) $notification->company_id)?->name ?? $companyName);
        }

        $actionUrl = is_string($notification->action_url) && $notification->action_url !== ''
            ? url($notification->action_url)
            : null;

        Mail::to($email)->send(new OperationalReminderMail(
            organizationName: $companyName,
            recipientName: (string) ($user->name ?? 'Team member'),
            title: (string) $notification->title,
            message: (string) $notification->message,
            actionUrl: $actionUrl,
        ));
    }
}
