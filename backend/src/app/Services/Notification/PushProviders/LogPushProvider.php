<?php

declare(strict_types=1);

namespace App\Services\Notification\PushProviders;

use App\Models\AppNotification;
use App\Models\PushSubscription;
use App\Services\Notification\Contracts\PushProvider;
use Illuminate\Support\Facades\Log;

class LogPushProvider implements PushProvider
{
    public function send(PushSubscription $subscription, AppNotification $notification): array
    {
        Log::info('Simulated push notification delivery.', [
            'subscription_id' => $subscription->id,
            'provider' => $subscription->provider,
            'device_token' => $subscription->device_token,
            'notification_id' => $notification->id,
            'notification_type' => $notification->type,
            'title' => $notification->title,
            'message' => $notification->message,
            'action_url' => $notification->action_url,
        ]);

        return [
            'success' => true,
            'error' => null,
        ];
    }
}
