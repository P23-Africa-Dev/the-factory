<?php

declare(strict_types=1);

namespace App\Services\Notification\PushProviders;

use App\Models\AppNotification;
use App\Models\PushSubscription;
use App\Services\Notification\Contracts\PushProvider;
use Illuminate\Support\Facades\Http;

class ExpoPushPushProvider implements PushProvider
{
    public function send(PushSubscription $subscription, AppNotification $notification): array
    {
        try {
            $response = Http::withHeaders([
                'Content-Type' => 'application/json',
                'Accept' => 'application/json',
            ])->post('https://exp.host/--/api/v2/push/send', [
                'to' => $subscription->device_token,
                'title' => $notification->title,
                'body' => $notification->message,
                'data' => [
                    'notification_id' => $notification->id,
                    'action_url' => $notification->action_url,
                ],
                'sound' => 'default',
            ]);

            if ($response->successful()) {
                $body = $response->json();
                $data = $body['data'] ?? [];

                if (isset($data['status']) && $data['status'] === 'error') {
                    return [
                        'success' => false,
                        'error' => $data['message'] ?? 'Expo returned error delivery status.',
                    ];
                }

                return ['success' => true, 'error' => null];
            }

            return [
                'success' => false,
                'error' => (string) $response->body(),
            ];
        } catch (\Throwable $e) {
            return [
                'success' => false,
                'error' => $e->getMessage(),
            ];
        }
    }
}
