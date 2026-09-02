<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Notifications\Concerns\UsesFactory23MailBranding;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class InternalUserOnboardingInviteNotification extends Notification
{
    use Queueable;
    use UsesFactory23MailBranding;

    public function __construct(
        private readonly string $invitationLink,
        private readonly string $role,
        private readonly string $zone,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): \Illuminate\Notifications\Messages\MailMessage
    {
        return $this->factory23Mail()
            ->subject("You're invited to Factory23")
            ->greeting("Hello {$notifiable->name},")
            ->line('You have been invited to join your team on Factory23.')
            ->line($this->factory23DetailTable([
                'Role' => $this->role,
                'Assigned zone' => $this->zone,
            ]))
            ->line('Please complete your onboarding and set your password using the secure link below.')
            ->action('Complete onboarding', $this->invitationLink)
            ->line('For security, this link expires and can only be used once.')
            ->salutation($this->factory23Salutation());
    }
}
