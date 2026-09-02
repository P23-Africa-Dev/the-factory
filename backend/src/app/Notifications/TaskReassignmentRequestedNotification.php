<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Models\Task;
use App\Models\TaskReassignment;
use App\Notifications\Concerns\UsesFactory23MailBranding;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;
use Illuminate\Support\HtmlString;

class TaskReassignmentRequestedNotification extends Notification
{
    use Queueable;
    use UsesFactory23MailBranding;

    public function __construct(
        private readonly TaskReassignment $reassignment,
        private readonly Task $task,
        private readonly string $currentOwnerName,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): \Illuminate\Notifications\Messages\MailMessage
    {
        $acceptUrl = $this->factory23FrontendUrl('tasks/reassignments/' . $this->reassignment->id . '?action=accept');
        $rejectUrl = $this->factory23FrontendUrl('tasks/reassignments/' . $this->reassignment->id . '?action=reject');

        $rows = [
            'Task' => $this->task->title,
            'Current owner' => $this->currentOwnerName,
        ];

        if ($this->task->project !== null) {
            $rows['Project'] = $this->task->project->name;
        }

        if ($this->task->due_at !== null) {
            $rows['Due date'] = $this->task->due_at->toIso8601String();
        }

        if (! empty($this->task->location_text)) {
            $rows['Location'] = $this->task->location_text;
        }

        if (! empty($this->task->description)) {
            $rows['Summary'] = $this->task->description;
        }

        if (! empty($this->reassignment->reason)) {
            $rows['Reason'] = $this->reassignment->reason;
        }

        $rejectButton = new HtmlString(view('emails.components.secondary-button', [
            'url' => $rejectUrl,
            'label' => 'Reject reassignment',
        ])->render());

        return $this->factory23Mail()
            ->subject('Task reassignment request — Factory23')
            ->greeting("Hello {$notifiable->name},")
            ->line('You have received a task reassignment request.')
            ->line($this->factory23DetailTable($rows))
            ->action('Accept reassignment', $acceptUrl)
            ->line($rejectButton)
            ->line('If you do not want this task, use the reject option above.')
            ->salutation($this->factory23Salutation());
    }
}
