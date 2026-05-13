<?php

declare(strict_types=1);

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class TaskAssignedNotification extends Notification
{
    use Queueable;

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

    public function toMail(object $notifiable): MailMessage
    {
        $mail = (new MailMessage)
            ->mailer('resend')
            ->subject($this->selfAssigned ? 'Self task created' : 'New task assigned')
            ->greeting("Hello {$notifiable->name},")
            ->line($this->selfAssigned
                ? 'A new standalone task has been created for you.'
                : "You have been assigned a new task by {$this->assignedByName}.")
            ->line("Task: {$this->taskTitle}")
            ->line("Task ID: {$this->taskId}");

        if ($this->projectName !== null && $this->projectName !== '') {
            $mail->line("Project: {$this->projectName}");
        }

        if ($this->dueAt !== null && $this->dueAt !== '') {
            $mail->line("Due date: {$this->dueAt}");
        }

        return $mail
            ->line('Please sign in to your dashboard to review task details.')
            ->salutation('The Factory Team');
    }
}
