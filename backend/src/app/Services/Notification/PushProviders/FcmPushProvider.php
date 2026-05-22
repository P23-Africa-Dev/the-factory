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

        $response = Http::withHeaders([
            'Authorization' => 'key=' . $serverKey,
            'Content-Type' => 'application/json',
        ])->post($endpoint, [
            'to' => $subscription->device_token,
            'notification' => [
                'title' => $notification->title,
                'body' => $notification->message,
            ],
            'data' => [
                'notification_id' => (string) $notification->id,
                'type' => $notification->type,
                'category' => $notification->category,
                'reference_type' => $notification->reference_type,
                'reference_id' => $notification->reference_id,
                'action_url' => $notification->action_url,
                'action_route' => $notification->action_route,
                'metadata' => $notification->metadata ?? [],
            ],
        ]);

        if ($response->successful()) {
            return [
                'success' => true,
                'error' => null,
            ];
        }

        return [
            'success' => false,
            'error' => (string) $response->body(),
        ];
    }
}
