<?php

namespace App\Notifications;

use App\Notifications\Concerns\UsesFactory23MailBranding;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class EnterpriseDemoRequestReceivedNotification extends Notification
{
    use Queueable;
    use UsesFactory23MailBranding;

    public function __construct(
        private readonly string $fullName,
        private readonly string $companyName,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): \Illuminate\Notifications\Messages\MailMessage
    {
        return $this->factory23Mail()
            ->subject('Demo request received — Factory23')
            ->greeting("Hello {$this->fullName},")
            ->line('Your enterprise demo request has been received successfully.')
            ->line($this->factory23DetailTable([
                'Company' => $this->companyName,
            ]))
            ->line('Our team will review your request and contact you shortly.')
            ->salutation($this->factory23Salutation());
    }
}
