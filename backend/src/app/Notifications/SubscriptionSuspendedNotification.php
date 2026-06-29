<?php

declare(strict_types=1);

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class SubscriptionSuspendedNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly string $companyName,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $frontendUrl = rtrim((string) config('billing.frontend_url'), '/');

        return (new MailMessage)
            ->mailer('resend')
            ->subject("Account suspended - {$this->companyName}")
            ->greeting("Hello {$notifiable->name},")
            ->line("Your Factory 23 subscription for {$this->companyName} has been suspended due to non-payment.")
            ->line('Your team data has been preserved. Renew your subscription to restore dashboard access.')
            ->action('Renew subscription', $frontendUrl . '/subscribe?reason=expired');
    }
}
