<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class EnterpriseActivationNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly string $companyId,
        private readonly string $email,
        private readonly string $onboardingLink,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->mailer('resend')
            ->subject('Your enterprise account is ready - The Factory')
            ->greeting("Hello {$notifiable->name},")
            ->line('Your enterprise request has been approved and your account is ready for setup.')
            ->line("Company ID: {$this->companyId}")
            ->line("Email: {$this->email}")
            ->line('Use the link below to complete first-time setup and create your password.')
            ->action('Complete first-time setup', $this->onboardingLink)
            ->line('This link expires for security reasons.');
    }
}
