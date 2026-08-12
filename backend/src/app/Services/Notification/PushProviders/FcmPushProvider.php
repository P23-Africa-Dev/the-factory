<?php

declare(strict_types=1);

namespace App\Services\Notification\PushProviders;

use App\Models\AppNotification;
use App\Models\PushSubscription;
use App\Services\Notification\Contracts\PushProvider;
use Illuminate\Support\Facades\Http;

class FcmPushProvider implements PushProvider
{
    public function send(PushSubscription $subscription, AppNotification $notification): array
    {
        $serverKey = (string) config('services.fcm.server_key', '');
        $endpoint = (string) config('services.fcm.legacy_send_endpoint', 'https://fcm.googleapis.com/fcm/send');

        if ($serverKey === '') {
            return [
                'success' => false,
                'error' => 'FCM server key is not configured.',
            ];
        }

        $actionUrl = $notification->action_url ?: ($notification->action_route ?: '/');
        $title = (string) $notification->title;
        $body = (string) $notification->message;

        $response = Http::withHeaders([
            'Authorization' => 'key=' . $serverKey,
            'Content-Type' => 'application/json',
        ])->post($endpoint, [
            'to' => $subscription->device_token,
            // System tray notification (shown when app is backgrounded/killed).
            'notification' => [
                'title' => $title,
                'body' => $body,
                'sound' => 'default',
                'click_action' => 'FCM_PLUGIN_ACTIVITY',
            ],
            'data' => [
                'notification_id' => (string) $notification->id,
                'type' => (string) $notification->type,
                'category' => (string) $notification->category,
                'reference_type' => (string) ($notification->reference_type ?? ''),
                'reference_id' => (string) ($notification->reference_id ?? ''),
                'action_url' => (string) $actionUrl,
                'action_route' => (string) ($notification->action_route ?? ''),
                'title' => $title,
                'body' => $body,
            ],
            'priority' => 'high',
            'content_available' => true,
        ]);

        if (! $response->successful()) {
            return [
                'success' => false,
                'error' => (string) $response->body(),
            ];
        }

        $payload = $response->json();
        // Legacy FCM returns HTTP 200 even when success=0 (invalid token, etc.).
        if (is_array($payload) && array_key_exists('success', $payload) && (int) $payload['success'] < 1) {
            $results = $payload['results'] ?? [];
            $firstError = is_array($results) && isset($results[0]['error'])
                ? (string) $results[0]['error']
                : 'FCM reported zero successful deliveries.';

            return [
                'success' => false,
                'error' => $firstError,
            ];
        }

        return [
            'success' => true,
            'error' => null,
        ];
    }
}
