<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class WelcomeNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct() {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Welcome to The Factory')
            ->greeting("Welcome {$notifiable->name}!")
            ->line('Your email has been verified successfully.')
            ->line('Your account is now ready to use.')
            ->line('If you did not create this account, please contact support immediately.')
            ->salutation('Factory 23 Team');
    }
}
