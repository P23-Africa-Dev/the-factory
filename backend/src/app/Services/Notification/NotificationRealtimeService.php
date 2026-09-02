<?php

declare(strict_types=1);

namespace App\Services\Notification;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Redis;
use Throwable;

class NotificationRealtimeService
{
    public function publishToUser(int $userId, string $event, array $data): void
    {
        $prefix = rtrim((string) config('notifications.redis_channel_prefix', 'factory23.notifications'), '.');
        $channel = $prefix . '.user.' . $userId;

        $payload = [
            'event' => $event,
            'version' => 1,
            'user_id' => $userId,
            'occurred_at' => now()->toIso8601String(),
            'data' => $data,
        ];

        try {
            Redis::connection('pubsub')->publish($channel, (string) json_encode($payload, JSON_THROW_ON_ERROR));
        } catch (Throwable $exception) {
            Log::warning('Failed to publish notification realtime payload.', [
                'channel' => $channel,
                'event' => $event,
                'user_id' => $userId,
                'exception' => $exception::class,
                'message' => $exception->getMessage(),
            ]);
        }
    }
}
