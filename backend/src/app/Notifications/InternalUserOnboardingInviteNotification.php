<?php

declare(strict_types=1);

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class InternalUserOnboardingInviteNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly string $invitationLink,
        private readonly string $role,
        private readonly string $zone,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->mailer('resend')
            ->subject('You are invited to join The Factory')
            ->greeting("Hello {$notifiable->name},")
            ->line("You have been added as {$this->role} in The Factory.")
            ->line("Assigned zone: {$this->zone}")
            ->line('Please complete your onboarding and set your password using the secure link below.')
            ->action('Complete onboarding', $this->invitationLink)
            ->line('For security, this link expires and can only be used once.')
            ->salutation('The Factory Team');
    }
}
