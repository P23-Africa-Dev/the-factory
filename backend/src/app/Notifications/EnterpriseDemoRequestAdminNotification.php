<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class EnterpriseDemoRequestAdminNotification extends Notification
{
    use Queueable;

    public function __construct(private readonly array $payload) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->mailer('resend')
            ->subject('New enterprise demo request submitted')
            ->line('A new company onboarding demo request has been submitted.')
            ->line("Full Name: {$this->payload['full_name']}")
            ->line("Email: {$this->payload['email']}")
            ->line("Phone: {$this->payload['phone']}")
            ->line("Company: {$this->payload['company_name']}")
            ->line("Country: {$this->payload['country']}")
            ->line("Team Size: {$this->payload['team_size']}")
            ->line("Use Case: {$this->payload['use_case']}");
    }

    public function routeNotificationForMail(): ?string
    {
        return config('enterprise.notification_email');
    }
}
