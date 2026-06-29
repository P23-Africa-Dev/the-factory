<?php

declare(strict_types=1);

namespace App\Notifications;

use Carbon\CarbonInterface;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class SubscriptionExpiryReminderNotification extends Notification
{
    use Queueable;

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

    public function toMail(object $notifiable): MailMessage
    {
        $endDate = $this->periodEnd?->format('F j, Y') ?? 'soon';
        $subject = $this->inGracePeriod
            ? "Action required: {$this->companyName} subscription grace period ending"
            : "Reminder: {$this->companyName} subscription renews in {$this->daysRemaining} days";

        $message = (new MailMessage)
            ->mailer('resend')
            ->subject($subject)
            ->greeting("Hello {$notifiable->name},");

        if ($this->inGracePeriod) {
            return $message
                ->line("Your subscription for {$this->companyName} is in a grace period.")
                ->line("Your account will be suspended on {$endDate} if payment is not received.")
                ->line('Please renew now to keep your team and data accessible.');
        }

        return $message
            ->line("Your Factory 23 subscription for {$this->companyName} renews on {$endDate}.")
            ->line("This is a reminder that your subscription ends in {$this->daysRemaining} day(s).")
            ->line('Renew on time to avoid service interruption.');
    }
}
