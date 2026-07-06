<?php

declare(strict_types=1);

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class DriveFileSharedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        private readonly string $sharerName,
        private readonly string $fileName,
        private readonly string $companyName,
        private readonly string $actionUrl,
    ) {}

    /**
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->mailer('resend')
            ->subject('A file was shared with you in Company Drive')
            ->greeting('Hello ' . ($notifiable->name ?? 'there') . ',')
            ->line(sprintf('%s shared "%s" with you in %s Company Drive.', $this->sharerName, $this->fileName, $this->companyName))
            ->action('Open in Drive', $this->actionUrl)
            ->line('You can download this file any time from your drive.');
    }
}
