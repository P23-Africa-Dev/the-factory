<?php

declare(strict_types=1);

namespace App\Notifications;

use Carbon\CarbonInterface;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class SubscriptionGraceStartedNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly string $companyName,
        private readonly CarbonInterface $graceEndsAt,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->mailer('resend')
            ->subject("Grace period started - {$this->companyName}")
            ->greeting("Hello {$notifiable->name},")
            ->line("Your subscription for {$this->companyName} has entered a grace period.")
            ->line('Your account remains accessible for now, but please renew to avoid suspension.')
            ->line("Grace period ends on {$this->graceEndsAt->format('F j, Y')}.");
    }
}
