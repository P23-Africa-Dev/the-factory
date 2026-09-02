<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Notifications\Concerns\UsesFactory23MailBranding;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class SubscriptionSuspendedNotification extends Notification
{
    use Queueable;
    use UsesFactory23MailBranding;

    public function __construct(
        private readonly string $companyName,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): \Illuminate\Notifications\Messages\MailMessage
    {
        return $this->factory23Mail()
            ->subject("Account suspended — {$this->companyName}")
            ->greeting("Hello {$notifiable->name},")
            ->line("Your Factory23 subscription for {$this->companyName} has been suspended due to non-payment.")
            ->line('Your team data has been preserved. Renew your subscription to restore dashboard access.')
            ->action('Renew subscription', $this->factory23FrontendUrl('subscribe?reason=expired'))
            ->salutation($this->factory23Salutation());
    }
}
