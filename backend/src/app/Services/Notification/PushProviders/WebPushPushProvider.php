<?php

declare(strict_types=1);

namespace App\Services\Notification\PushProviders;

use App\Models\AppNotification;
use App\Models\PushSubscription;
use App\Services\Notification\Contracts\PushProvider;
use Minishlink\WebPush\WebPush;
use Minishlink\WebPush\Subscription;

class WebPushPushProvider implements PushProvider
{
    public function send(PushSubscription $subscription, AppNotification $notification): array
    {
        $auth = [
            'VAPID' => config('services.vapid'),
        ];

        try {
            $webPush = new WebPush($auth);
            $keys = $subscription->subscription_payload['keys'] ?? [];

            if (empty($keys['p256dh']) || empty($keys['auth'])) {
                return [
                    'success' => false,
                    'error' => 'Web Push keys (p256dh, auth) are missing from payload.',
                ];
            }

            $webPushSub = Subscription::create([
                'endpoint' => $subscription->endpoint,
                'publicKey' => $keys['p256dh'],
                'authToken' => $keys['auth'],
            ]);

            $report = $webPush->sendOneNotification($webPushSub, json_encode([
                'title' => $notification->title,
                'body' => $notification->message,
                'action_url' => $notification->action_url ?? '/',
                'tag' => 'factory-notification-' . $notification->id,
            ]));

            if ($report->isSuccess()) {
                return ['success' => true, 'error' => null];
            }

            return [
                'success' => false,
                'error' => $report->getReason(),
            ];
        } catch (\Throwable $e) {
            return [
                'success' => false,
                'error' => $e->getMessage(),
            ];
        }
    }
}
