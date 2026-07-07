<?php

namespace App\Notifications;

use App\Notifications\Concerns\UsesFactory23MailBranding;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

class SmtpConnectionTestNotification extends Notification implements ShouldQueue
{
    use Queueable;
    use UsesFactory23MailBranding;

    public function __construct(
        private readonly string $environment,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): \Illuminate\Notifications\Messages\MailMessage
    {
        return $this->factory23Mail()
            ->subject('Mail delivery test — Factory23')
            ->greeting('Mail configuration test')
            ->line('This confirms your Factory23 mail configuration can send through the configured production transport.')
            ->line($this->factory23DetailTable([
                'Environment' => $this->environment,
                'Sent at' => now()->toDateTimeString(),
                'Mailer' => 'resend',
            ]))
            ->salutation(config('brand.name') . ' System');
    }
}
