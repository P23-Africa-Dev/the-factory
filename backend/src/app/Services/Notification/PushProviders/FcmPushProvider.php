<?php

declare(strict_types=1);

namespace App\Services\Notification\PushProviders;

use App\Models\AppNotification;
use App\Models\PushSubscription;
use App\Services\Notification\Contracts\PushProvider;
use App\Services\Notification\FcmAccessTokenProvider;
use App\Support\AgentNotificationDeepLink;
use Illuminate\Support\Facades\Http;
use Throwable;

class FcmPushProvider implements PushProvider
{
    public function __construct(
        private readonly FcmAccessTokenProvider $accessTokenProvider,
    ) {}

    public function send(PushSubscription $subscription, AppNotification $notification): array
    {
        $deviceToken = (string) ($subscription->device_token ?: $subscription->endpoint);
        if ($deviceToken === '') {
            return [
                'success' => false,
                'error' => 'FCM device token is missing.',
            ];
        }

        try {
            $auth = $this->accessTokenProvider->tokenAndProject();
        } catch (Throwable $e) {
            return [
                'success' => false,
                'error' => $e->getMessage(),
            ];
        }

        $actionUrl = AgentNotificationDeepLink::resolve(
            $notification->action_url ?: ($notification->action_route ?: '/'),
        );
        $title = (string) $notification->title;
        $body = (string) $notification->message;

        // FCM data payload values must be strings.
        $data = [
            'notification_id' => (string) $notification->id,
            'type' => (string) $notification->type,
            'category' => (string) $notification->category,
            ...AgentNotificationDeepLink::clickContext($notification),
            'action_url' => (string) $actionUrl,
            'title' => $title,
            'body' => $body,
        ];

        $endpoint = sprintf(
            'https://fcm.googleapis.com/v1/projects/%s/messages:send',
            rawurlencode($auth['project_id']),
        );

        $response = Http::withToken($auth['access_token'])
            ->acceptJson()
            ->post($endpoint, [
                'message' => [
                    'token' => $deviceToken,
                    'notification' => [
                        'title' => $title,
                        'body' => $body,
                    ],
                    'data' => $data,
                    'android' => [
                        'priority' => 'HIGH',
                        // No click_action: the default launcher intent opens MainActivity, where
                        // Capacitor emits pushNotificationActionPerformed with the data above.
                        // (A custom action with no matching intent-filter makes taps do nothing.)
                        'notification' => [
                            'sound' => 'default',
                        ],
                    ],
                ],
            ]);

        if (! $response->successful()) {
            return [
                'success' => false,
                'error' => (string) $response->body(),
            ];
        }

        return [
            'success' => true,
            'error' => null,
        ];
    }
}
