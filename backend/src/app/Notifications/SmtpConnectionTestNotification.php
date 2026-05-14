<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class SmtpConnectionTestNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        private readonly string $environment,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->mailer('resend')
            ->subject('SMTP Test Email - Factory 23')
            ->greeting('SMTP configuration test')
            ->line('This confirms your Laravel mail configuration can send through the configured production transport.')
            ->line('Environment: '.$this->environment)
            ->line('Sent at: '.now()->toDateTimeString())
            ->salutation('Factory 23 System');
    }
}
