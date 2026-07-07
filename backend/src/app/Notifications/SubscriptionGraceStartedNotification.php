<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Notifications\Concerns\UsesFactory23MailBranding;
use Carbon\CarbonInterface;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;
use Illuminate\Support\HtmlString;

class SubscriptionGraceStartedNotification extends Notification
{
    use Queueable;
    use UsesFactory23MailBranding;

    public function __construct(
        private readonly string $companyName,
        private readonly CarbonInterface $graceEndsAt,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): \Illuminate\Notifications\Messages\MailMessage
    {
        $graceEnd = $this->graceEndsAt->format('F j, Y');

        return $this->factory23Mail()
            ->subject("Grace period started — {$this->companyName}")
            ->greeting("Hello {$notifiable->name},")
            ->line("Your Factory23 subscription for {$this->companyName} has entered a grace period.")
            ->line(new HtmlString(
                '<p style="margin:16px 0;padding:12px 16px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;color:#92400E;font-size:14px;">'
                . "Grace period ends on <strong>{$graceEnd}</strong>. Renew before this date to avoid suspension."
                . '</p>'
            ))
            ->line('Your account remains accessible for now, but please renew to avoid suspension.')
            ->salutation($this->factory23Salutation());
    }
}
