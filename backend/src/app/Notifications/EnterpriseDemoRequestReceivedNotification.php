<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class EnterpriseDemoRequestReceivedNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly string $fullName,
        private readonly string $companyName,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->mailer('resend')
            ->subject('Demo request received - The Factory')
            ->greeting("Hello {$this->fullName},")
            ->line('Your enterprise demo request has been received successfully.')
            ->line("Company: {$this->companyName}")
            ->line('Our team will review your request and contact you shortly.')
            ->salutation('The Factory Team');
    }
}
