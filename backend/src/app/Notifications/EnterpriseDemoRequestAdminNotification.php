<?php

namespace App\Notifications;

use App\Notifications\Concerns\UsesFactory23MailBranding;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class EnterpriseDemoRequestAdminNotification extends Notification
{
    use Queueable;
    use UsesFactory23MailBranding;

    public function __construct(private readonly array $payload) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): \Illuminate\Notifications\Messages\MailMessage
    {
        return $this->factory23Mail()
            ->subject('New demo request — Factory23')
            ->greeting('Hello,')
            ->line('A new company onboarding demo request has been submitted.')
            ->line($this->factory23DetailTable([
                'Full name' => $this->payload['full_name'] ?? null,
                'Email' => $this->payload['email'] ?? null,
                'Phone' => $this->payload['phone'] ?? null,
                'Company' => $this->payload['company_name'] ?? null,
                'Country' => $this->payload['country'] ?? null,
                'Team size' => $this->payload['team_size'] ?? null,
                'Use case' => $this->payload['use_case'] ?? null,
            ]))
            ->salutation($this->factory23Salutation());
    }

    public function routeNotificationForMail(): ?string
    {
        return config('enterprise.notification_email');
    }
}
