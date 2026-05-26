<?php

declare(strict_types=1);

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class PayrollStatusNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(
        private readonly string $status,
        private readonly string $periodLabel,
        private readonly string $amount,
        private readonly ?string $reason = null,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $message = (new MailMessage)
            ->subject('Payroll status updated')
            ->greeting("Hello {$notifiable->name},")
            ->line("Your payroll for {$this->periodLabel} is now {$this->status}.")
            ->line("Amount: {$this->amount}");

        if ($this->reason !== null && $this->reason !== '') {
            $message->line("Reason: {$this->reason}");
        }

        return $message->line('You can review the updated payroll status from your payroll page.')
            ->salutation('Factory 23 Team');
    }
}
