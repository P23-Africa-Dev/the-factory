<?php

declare(strict_types=1);

namespace App\Services\Notification;

use App\Models\AppNotification;
use App\Models\PushSubscription;
use App\Models\User;
use App\Services\Notification\Contracts\PushProvider;
use App\Services\Notification\PushProviders\FcmPushProvider;
use App\Services\Notification\PushProviders\LogPushProvider;

class PushNotificationService
{
    public function registerSubscription(User $user, array $payload): PushSubscription
    {
        $companyId = isset($payload['company_id']) ? (int) $payload['company_id'] : null;
        $deviceToken = (string) $payload['device_token'];
        $deviceTokenHash = hash('sha256', $deviceToken);

        return PushSubscription::query()->updateOrCreate(
            ['device_token_hash' => $deviceTokenHash],
            [
                'user_id' => $user->id,
                'company_id' => $companyId,
                'provider' => $payload['provider'] ?? config('notifications.push.provider', 'log'),
                'platform' => $payload['platform'] ?? null,
                'device_token' => $deviceToken,
                'device_token_hash' => $deviceTokenHash,
                'endpoint' => $payload['endpoint'] ?? null,
                'subscription_payload' => $payload['subscription_payload'] ?? null,
                'user_agent' => $payload['user_agent'] ?? null,
                'is_active' => (bool) ($payload['is_active'] ?? true),
                'last_seen_at' => now(),
            ],
        );
    }

    public function deactivateSubscription(User $user, string $deviceToken): int
    {
        $deviceTokenHash = hash('sha256', $deviceToken);

        return PushSubscription::query()
            ->where('user_id', $user->id)
            ->where('device_token_hash', $deviceTokenHash)
            ->where('device_token', $deviceToken)
            ->update([
                'is_active' => false,
                'updated_at' => now(),
            ]);
    }

    public function activeSubscriptionsForUser(int $userId, ?int $companyId = null)
    {
        return PushSubscription::query()
            ->where('user_id', $userId)
            ->where('is_active', true)
            ->when($companyId !== null, function ($query) use ($companyId): void {
                $query->where(function ($sub) use ($companyId): void {
                    $sub->whereNull('company_id')
                        ->orWhere('company_id', $companyId);
                });
            })
            ->get();
    }

    public function deliver(PushSubscription $subscription, AppNotification $notification): array
    {
        $result = $this->providerFor($subscription->provider)->send($subscription, $notification);

        if ($result['success']) {
            $subscription->update([
                'failed_attempts' => 0,
                'last_failure_reason' => null,
                'last_failed_at' => null,
                'last_seen_at' => now(),
            ]);

            return $result;
        }

        $attempts = ((int) $subscription->failed_attempts) + 1;

        $subscription->update([
            'failed_attempts' => $attempts,
            'last_failure_reason' => $result['error'],
            'last_failed_at' => now(),
            'is_active' => $attempts < (int) config('notifications.push.max_failed_attempts_before_deactivate', 5),
        ]);

        return $result;
    }

    private function providerFor(string $provider): PushProvider
    {
        return match ($provider) {
            'fcm' => app(FcmPushProvider::class),
            default => app(LogPushProvider::class),
        };
    }
}
