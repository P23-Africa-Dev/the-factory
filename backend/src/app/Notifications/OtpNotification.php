<?php

namespace App\Notifications;

use App\Notifications\Concerns\UsesFactory23MailBranding;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class OtpNotification extends Notification
{
    use Queueable;
    use UsesFactory23MailBranding;

    public function __construct(
        private readonly string $otp,
        private readonly string $type = 'registration',
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): \Illuminate\Notifications\Messages\MailMessage
    {
        return $this->factory23Mail()
            ->subject($this->resolveSubject())
            ->greeting("Hello {$notifiable->name}!")
            ->line($this->resolveIntroLine())
            ->line($this->factory23OtpBox($this->otp))
            ->line('This code expires in **10 minutes**.')
            ->line('If you did not request this, please ignore this email.')
            ->salutation($this->factory23Salutation());
    }

    private function resolveSubject(): string
    {
        return match ($this->type) {
            'registration' => 'Verify your email — Factory23',
            'login' => 'Your login verification code — Factory23',
            'password_reset' => 'Reset your password — Factory23',
            default => 'Your verification code — Factory23',
        };
    }

    private function resolveIntroLine(): string
    {
        return match ($this->type) {
            'registration' => 'Thank you for signing up! Please use the code below to verify your email address.',
            'login' => 'Use the following code to complete your login.',
            'password_reset' => 'Use the following code to reset your password.',
            default => 'Use the following code to complete your request.',
        };
    }
}
