<?php

declare(strict_types=1);

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class PasswordResetLinkNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly string $resetUrl,
        private readonly int $expiresInMinutes,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $name = trim((string) ($notifiable->name ?? 'there'));

        return (new MailMessage)
            ->mailer('resend')
            ->subject('Reset your Factory23 password')
            ->greeting('Hello ' . ($name !== '' ? $name : 'there') . ',')
            ->line('We received a request to reset your password for your Factory23 account.')
            ->action('Reset Password', $this->resetUrl)
            ->line('This reset link expires in ' . $this->expiresInMinutes . ' minutes and can only be used once.')
            ->line('If you did not request this reset, you can safely ignore this email and your password will remain unchanged.')
            ->salutation('Factory23 Security Team');
    }
}
