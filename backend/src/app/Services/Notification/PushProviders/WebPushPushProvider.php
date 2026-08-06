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
        $publicKey = (string) config('services.vapid.public_key', '');
        $privateKey = (string) config('services.vapid.private_key', '');
        $subject = (string) config('services.vapid.subject', 'mailto:info@thefactory23.com');

        if ($publicKey === '' || $privateKey === '') {
            return [
                'success' => false,
                'error' => 'VAPID public/private keys are not configured.',
            ];
        }

        // minishlink/web-push expects camelCase keys under VAPID.
        $auth = [
            'VAPID' => [
                'subject' => $subject,
                'publicKey' => $publicKey,
                'privateKey' => $privateKey,
            ],
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

            $endpoint = (string) ($subscription->endpoint ?: $subscription->device_token);
            if ($endpoint === '') {
                return [
                    'success' => false,
                    'error' => 'Web Push endpoint is missing.',
                ];
            }

            $webPushSub = Subscription::create([
                'endpoint' => $endpoint,
                'publicKey' => $keys['p256dh'],
                'authToken' => $keys['auth'],
            ]);

            $actionUrl = $notification->action_url ?: ($notification->action_route ?: '/');

            $report = $webPush->sendOneNotification($webPushSub, json_encode([
                'title' => $notification->title,
                'body' => $notification->message,
                'message' => $notification->message,
                'action_url' => $actionUrl,
                'tag' => 'factory-notification-' . $notification->id,
                'notification_id' => $notification->id,
                'type' => $notification->type,
                'category' => $notification->category,
            ], JSON_THROW_ON_ERROR));

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
