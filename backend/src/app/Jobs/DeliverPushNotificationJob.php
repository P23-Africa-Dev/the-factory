<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Models\AppNotification;
use App\Models\PushSubscription;
use App\Services\Notification\PushNotificationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class DeliverPushNotificationJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 5;

    public array $backoff = [30, 60, 120, 300, 600];

    public function __construct(
        public readonly int $pushSubscriptionId,
        public readonly int $notificationId,
    ) {
        $this->onQueue('notifications-push');
    }

    public function handle(PushNotificationService $pushNotificationService): void
    {
        $subscription = PushSubscription::query()->find($this->pushSubscriptionId);
        $notification = AppNotification::query()->find($this->notificationId);

        if (! $subscription || ! $notification || ! $subscription->is_active) {
            return;
        }

        $result = $pushNotificationService->deliver($subscription, $notification);

        if (! $result['success']) {
            throw new \RuntimeException((string) $result['error']);
        }
    }
}
