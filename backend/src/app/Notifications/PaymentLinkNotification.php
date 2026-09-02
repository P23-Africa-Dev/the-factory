<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Enums\BillingInterval;
use App\Notifications\Concerns\UsesFactory23MailBranding;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class PaymentLinkNotification extends Notification
{
    use Queueable;
    use UsesFactory23MailBranding;

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

    public function toMail(object $notifiable): \Illuminate\Notifications\Messages\MailMessage
    {
        $intervalLabel = $this->interval === BillingInterval::ANNUAL ? 'annual' : 'monthly';

        return $this->factory23Mail()
            ->subject("Complete your subscription — {$this->companyName}")
            ->greeting("Hello {$notifiable->name},")
            ->line("Your Factory23 subscription for {$this->companyName} is ready to be completed.")
            ->line($this->factory23DetailTable([
                'Company' => $this->companyName,
                'Plan' => "{$this->planLabel} ({$intervalLabel})",
            ]))
            ->action('Complete payment', $this->paymentUrl)
            ->line('Once payment is complete, you can finish onboarding and access your dashboard.')
            ->salutation($this->factory23Salutation());
    }
}
