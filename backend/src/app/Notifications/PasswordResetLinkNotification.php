<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Notifications\Concerns\UsesFactory23MailBranding;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class PasswordResetLinkNotification extends Notification
{
    use Queueable;
    use UsesFactory23MailBranding;

    public function __construct(
        private readonly string $resetUrl,
        private readonly int $expiresInMinutes,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): \Illuminate\Notifications\Messages\MailMessage
    {
        $name = trim((string) ($notifiable->name ?? 'there'));

        return $this->factory23Mail()
            ->subject('Reset your Factory23 password')
            ->greeting('Hello ' . ($name !== '' ? $name : 'there') . ',')
            ->line('We received a request to reset your password for your Factory23 account.')
            ->action('Reset Password', $this->resetUrl)
            ->line('This reset link expires in ' . $this->expiresInMinutes . ' minutes and can only be used once.')
            ->line('If you did not request this reset, you can safely ignore this email and your password will remain unchanged.')
            ->salutation($this->factory23Salutation(config('brand.security_team')));
    }
}
