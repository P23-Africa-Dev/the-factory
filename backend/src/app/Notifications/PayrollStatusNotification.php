<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Notifications\Concerns\UsesFactory23MailBranding;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

class PayrollStatusNotification extends Notification implements ShouldQueue
{
    use Queueable;
    use UsesFactory23MailBranding;

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

    public function toMail(object $notifiable): \Illuminate\Notifications\Messages\MailMessage
    {
        $rows = [
            'Period' => $this->periodLabel,
            'Status' => $this->status,
            'Amount' => $this->amount,
        ];

        if ($this->reason !== null && $this->reason !== '') {
            $rows['Reason'] = $this->reason;
        }

        return $this->factory23Mail()
            ->subject('Payroll update — Factory23')
            ->greeting("Hello {$notifiable->name},")
            ->line('Your payroll status has been updated.')
            ->line($this->factory23DetailTable($rows))
            ->action('View payroll', $this->factory23FrontendUrl('payroll'))
            ->salutation($this->factory23Salutation());
    }
}
