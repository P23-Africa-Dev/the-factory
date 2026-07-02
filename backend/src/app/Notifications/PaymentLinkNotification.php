<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Enums\BillingInterval;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class PaymentLinkNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly string $companyName,
        private readonly string $paymentUrl,
        private readonly string $planLabel,
        private readonly BillingInterval $interval,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $intervalLabel = $this->interval === BillingInterval::ANNUAL ? 'annual' : 'monthly';

        return (new MailMessage)
            ->mailer('resend')
            ->subject("Complete your Factory 23 subscription - {$this->companyName}")
            ->greeting("Hello {$notifiable->name},")
            ->line("Your subscription for {$this->companyName} is ready to be completed.")
            ->line("Plan: {$this->planLabel} ({$intervalLabel})")
            ->action('Complete payment', $this->paymentUrl)
            ->line('Once payment is complete, you can finish onboarding and access your dashboard.');
    }
}
