<?php

namespace App\Notifications;

use App\Notifications\Concerns\UsesFactory23MailBranding;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

class WelcomeNotification extends Notification implements ShouldQueue
{
    use Queueable;
    use UsesFactory23MailBranding;

    public function __construct() {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): \Illuminate\Notifications\Messages\MailMessage
    {
        return $this->factory23Mail()
            ->subject('Welcome to Factory23')
            ->greeting("Welcome {$notifiable->name}!")
            ->line('Your email has been verified successfully.')
            ->line('Your account is now ready to use.')
            ->action('Go to dashboard', $this->factory23FrontendUrl('login'))
            ->line('If you did not create this account, please contact support immediately.')
            ->salutation($this->factory23Salutation());
    }
}
