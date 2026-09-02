<?php

namespace App\Notifications;

use App\Notifications\Concerns\UsesFactory23MailBranding;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class EnterpriseActivationNotification extends Notification
{
    use Queueable;
    use UsesFactory23MailBranding;

    public function __construct(
        private readonly string $companyId,
        private readonly string $email,
        private readonly string $onboardingLink,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): \Illuminate\Notifications\Messages\MailMessage
    {
        return $this->factory23Mail()
            ->subject('Your enterprise account is ready — Factory23')
            ->greeting("Hello {$notifiable->name},")
            ->line('Your enterprise request has been approved and your account is ready for setup.')
            ->line($this->factory23DetailTable([
                'Company ID' => $this->companyId,
                'Email' => $this->email,
            ]))
            ->line('Use the link below to complete first-time setup and create your password.')
            ->action('Complete first-time setup', $this->onboardingLink)
            ->line('This link expires for security reasons.')
            ->salutation($this->factory23Salutation());
    }
}
