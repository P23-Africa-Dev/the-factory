<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Notifications\Concerns\UsesFactory23MailBranding;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class TaskObserverAddedNotification extends Notification
{
    use Queueable;
    use UsesFactory23MailBranding;

    public function __construct(
        private readonly int $taskId,
        private readonly string $taskTitle,
        private readonly string $addedByName,
        private readonly ?string $dueAt,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $rows = [
            'Task' => $this->taskTitle,
            'Task ID' => (string) $this->taskId,
            'Added by' => $this->addedByName,
        ];

        if ($this->dueAt !== null && $this->dueAt !== '') {
            $rows['Due date'] = $this->dueAt;
        }

        return $this->factory23Mail()
            ->subject('You are observing a task, Factory23')
            ->greeting("Hello {$notifiable->name},")
            ->line("{$this->addedByName} added you as an observer on a task. You can follow its progress and comment on it, but the task is not assigned to you.")
            ->line($this->factory23DetailTable($rows))
            ->action('View task', $this->factory23FrontendUrl('operations/all-tasks'))
            ->salutation($this->factory23Salutation());
    }
}
