<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Notifications\Concerns\UsesFactory23MailBranding;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class TaskAssignedNotification extends Notification
{
    use Queueable;
    use UsesFactory23MailBranding;

    public function __construct(
        private readonly int $taskId,
        private readonly string $taskTitle,
        private readonly string $assignedByName,
        private readonly ?string $dueAt,
        private readonly ?string $projectName,
        private readonly bool $selfAssigned = false,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): \Illuminate\Notifications\Messages\MailMessage
    {
        $rows = [
            'Task' => $this->taskTitle,
            'Task ID' => (string) $this->taskId,
        ];

        if ($this->projectName !== null && $this->projectName !== '') {
            $rows['Project'] = $this->projectName;
        }

        if ($this->dueAt !== null && $this->dueAt !== '') {
            $rows['Due date'] = $this->dueAt;
        }

        if (! $this->selfAssigned) {
            $rows['Assigned by'] = $this->assignedByName;
        }

        return $this->factory23Mail()
            ->subject($this->selfAssigned ? 'Task created — Factory23' : 'New task assigned — Factory23')
            ->greeting("Hello {$notifiable->name},")
            ->line($this->selfAssigned
                ? 'A new standalone task has been created for you.'
                : "You have been assigned a new task by {$this->assignedByName}.")
            ->line($this->factory23DetailTable($rows))
            ->action('View task', $this->factory23FrontendUrl('operations/all-tasks'))
            ->line('Please sign in to your dashboard to review task details.')
            ->salutation($this->factory23Salutation());
    }
}
