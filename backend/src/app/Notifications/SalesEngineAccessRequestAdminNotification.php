<?php

namespace App\Notifications;

use App\Notifications\Concerns\UsesFactory23MailBranding;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class SalesEngineAccessRequestAdminNotification extends Notification
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
            ->subject('Sales Engine access request, Factory23')
            ->greeting('Hello,')
            ->line('A Factory23 user has requested access to Sales Engine.')
            ->line($this->factory23DetailTable([
                'Name' => $this->payload['name'] ?? null,
                'Email' => $this->payload['email'] ?? null,
                'Company' => $this->payload['company_name'] ?? null,
                'User ID' => $this->payload['user_id'] ?? null,
                'Request ID' => $this->payload['request_id'] ?? null,
            ]))
            ->line('Review and accept or decline this request in the Factory23 Control dashboard.')
            ->salutation($this->factory23Salutation());
    }
}
