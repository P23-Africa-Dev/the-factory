<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Notifications\Concerns\UsesFactory23MailBranding;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

class DriveFileSharedNotification extends Notification implements ShouldQueue
{
    use Queueable;
    use UsesFactory23MailBranding;

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

    public function toMail(object $notifiable): \Illuminate\Notifications\Messages\MailMessage
    {
        return $this->factory23Mail()
            ->subject('File shared with you — Factory23')
            ->greeting('Hello ' . ($notifiable->name ?? 'there') . ',')
            ->line(sprintf('%s shared a file with you in Company Drive.', $this->sharerName))
            ->line($this->factory23DetailTable([
                'File' => $this->fileName,
                'Company' => $this->companyName,
                'Shared by' => $this->sharerName,
            ]))
            ->action('Open in Drive', $this->actionUrl)
            ->line('You can download this file any time from your drive.')
            ->salutation($this->factory23Salutation());
    }
}
