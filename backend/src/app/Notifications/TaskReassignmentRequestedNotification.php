<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Models\Task;
use App\Models\TaskReassignment;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class TaskReassignmentRequestedNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly TaskReassignment $reassignment,
        private readonly Task $task,
        private readonly string $currentOwnerName,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $frontendBase = rtrim((string) config('app.frontend_url', config('app.url')), '/');
        $acceptUrl = $frontendBase . '/tasks/reassignments/' . $this->reassignment->id . '?action=accept';
        $rejectUrl = $frontendBase . '/tasks/reassignments/' . $this->reassignment->id . '?action=reject';

        $mail = (new MailMessage)
            ->mailer('resend')
            ->subject('Task reassignment request')
            ->greeting("Hello {$notifiable->name},")
            ->line('You have received a task reassignment request.')
            ->line("Task: {$this->task->title}")
            ->line("Current owner: {$this->currentOwnerName}");

        if ($this->task->project !== null) {
            $mail->line("Project: {$this->task->project->name}");
        }

        if ($this->task->due_at !== null) {
            $mail->line('Due date: ' . $this->task->due_at->toIso8601String());
        }

        if (! empty($this->task->location_text)) {
            $mail->line("Location: {$this->task->location_text}");
        }

        if (! empty($this->task->description)) {
            $mail->line('Task summary: ' . $this->task->description);
        }

        if (! empty($this->reassignment->reason)) {
            $mail->line('Reason: ' . $this->reassignment->reason);
        }

        return $mail
            ->action('Accept Reassignment', $acceptUrl)
            ->line('If you do not want this task, you can reject the reassignment request.')
            ->line("Reject: {$rejectUrl}")
            ->salutation('The Factory Team');
    }
}
