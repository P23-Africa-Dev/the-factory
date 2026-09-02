<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Notifications\Concerns\UsesFactory23MailBranding;
use Carbon\CarbonInterface;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;
use Illuminate\Support\HtmlString;

class SubscriptionExpiryReminderNotification extends Notification
{
    use Queueable;
    use UsesFactory23MailBranding;

    public function __construct(
        private readonly string $companyName,
        private readonly int $daysRemaining,
        private readonly ?CarbonInterface $periodEnd,
        private readonly bool $inGracePeriod = false,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): \Illuminate\Notifications\Messages\MailMessage
    {
        $endDate = $this->periodEnd?->format('F j, Y') ?? 'soon';
        $subject = $this->inGracePeriod
            ? "Action required: {$this->companyName} subscription grace period ending"
            : "Reminder: {$this->companyName} subscription renews in {$this->daysRemaining} days";

        $message = $this->factory23Mail()
            ->subject($subject)
            ->greeting("Hello {$notifiable->name},");

        if ($this->inGracePeriod) {
            return $message
                ->line("Your Factory23 subscription for {$this->companyName} is in a grace period.")
                ->line(new HtmlString(
                    '<p style="margin:16px 0;padding:12px 16px;background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;color:#991B1B;font-size:14px;">'
                    . "Your account will be suspended on <strong>{$endDate}</strong> if payment is not received."
                    . '</p>'
                ))
                ->line('Please renew now to keep your team and data accessible.')
                ->salutation($this->factory23Salutation());
        }

        return $message
            ->line("Your Factory23 subscription for {$this->companyName} renews on {$endDate}.")
            ->line($this->factory23DetailTable([
                'Company' => $this->companyName,
                'Renewal date' => $endDate,
                'Days remaining' => (string) $this->daysRemaining,
            ]))
            ->line('Renew on time to avoid service interruption.')
            ->salutation($this->factory23Salutation());
    }
}
