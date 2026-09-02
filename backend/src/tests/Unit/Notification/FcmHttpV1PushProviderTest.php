<?php

declare(strict_types=1);

namespace Tests\Unit\Notification;

use App\Models\AppNotification;
use App\Models\PushSubscription;
use App\Services\Notification\FcmAccessTokenProvider;
use App\Services\Notification\PushProviders\FcmPushProvider;
use Illuminate\Support\Facades\Http;
use Mockery;
use Tests\TestCase;

class FcmHttpV1PushProviderTest extends TestCase
{
    public function test_sends_http_v1_message_with_remapped_action_url(): void
    {
        Http::fake([
            'fcm.googleapis.com/v1/projects/fcatory23-apk/messages:send' => Http::response([
                'name' => 'projects/fcatory23-apk/messages/0:1',
            ], 200),
        ]);

        /** @var FcmAccessTokenProvider&\Mockery\MockInterface $tokens */
        $tokens = Mockery::mock(FcmAccessTokenProvider::class);
        $tokens->shouldReceive('tokenAndProject')->once()->andReturn([
            'access_token' => 'ya29.test-token',
            'project_id' => 'fcatory23-apk',
        ]);

        $subscription = new PushSubscription([
            'provider' => 'fcm',
            'platform' => 'android',
            'device_token' => 'device-token-abc',
            'endpoint' => 'device-token-abc',
        ]);

        $notification = new AppNotification([
            'type' => 'task.assigned',
            'category' => 'task',
            'title' => 'New task',
            'message' => 'You have a new task',
            'action_url' => '/tasks/42',
            'action_route' => 'tasks.show',
            'reference_type' => 'App\\Models\\Task',
            'reference_id' => 42,
        ]);
        $notification->id = 99;

        $provider = new FcmPushProvider($tokens);
        $result = $provider->send($subscription, $notification);

        $this->assertTrue($result['success'], (string) ($result['error'] ?? ''));

        Http::assertSent(function ($request) {
            if (! str_contains($request->url(), 'messages:send')) {
                return false;
            }

            $body = $request->data();
            $message = $body['message'] ?? [];

            return ($message['token'] ?? null) === 'device-token-abc'
                && ($message['data']['action_url'] ?? null) === '/task/42'
                && ($message['notification']['title'] ?? null) === 'New task'
                && $request->hasHeader('Authorization', 'Bearer ya29.test-token');
        });
    }

    public function test_returns_error_when_service_account_missing(): void
    {
        /** @var FcmAccessTokenProvider&\Mockery\MockInterface $tokens */
        $tokens = Mockery::mock(FcmAccessTokenProvider::class);
        $tokens->shouldReceive('tokenAndProject')
            ->once()
            ->andThrow(new \RuntimeException('FCM service account is not configured. Set FCM_SERVICE_ACCOUNT_JSON or FCM_SERVICE_ACCOUNT_PATH.'));

        $provider = new FcmPushProvider($tokens);
        $result = $provider->send(
            new PushSubscription(['device_token' => 'tok']),
            new AppNotification(['title' => 't', 'message' => 'm', 'type' => 'x', 'category' => 'system']),
        );

        $this->assertFalse($result['success']);
        $this->assertStringContainsString('service account', (string) $result['error']);
    }
}
