<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Notification;

use App\Http\Controllers\Controller;
use App\Http\Requests\Notification\MarkAllNotificationsReadRequest;
use App\Http\Requests\Notification\RemovePushSubscriptionRequest;
use App\Http\Requests\Notification\UpsertPushSubscriptionRequest;
use App\Http\Resources\PushSubscriptionResource;
use App\Services\Notification\PushNotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PushSubscriptionController extends Controller
{
    public function __construct(private readonly PushNotificationService $pushNotificationService) {}

    public function index(MarkAllNotificationsReadRequest $request): JsonResponse
    {
        $companyId = $request->validated('company_id');

        if ($companyId !== null) {
            $this->ensureCompanyMembership((int) $request->user()->id, (int) $companyId);
        }

        $subscriptions = $this->pushNotificationService->activeSubscriptionsForUser(
            userId: (int) $request->user()->id,
            companyId: $companyId !== null ? (int) $companyId : null,
        );

        return $this->success(
            message: 'Push subscriptions fetched successfully.',
            data: [
                'items' => PushSubscriptionResource::collection($subscriptions),
            ],
        );
    }

    public function store(UpsertPushSubscriptionRequest $request): JsonResponse
    {
        $companyId = $request->validated('company_id');
        if ($companyId !== null) {
            $this->ensureCompanyMembership((int) $request->user()->id, (int) $companyId);
        }

        $subscription = $this->pushNotificationService->registerSubscription(
            user: $request->user(),
            payload: $request->validated(),
        );

        return $this->success(
            message: 'Push subscription registered successfully.',
            data: [
                'subscription' => new PushSubscriptionResource($subscription),
            ],
            status: 201,
        );
    }

    public function refresh(UpsertPushSubscriptionRequest $request): JsonResponse
    {
        $companyId = $request->validated('company_id');
        if ($companyId !== null) {
            $this->ensureCompanyMembership((int) $request->user()->id, (int) $companyId);
        }

        $subscription = $this->pushNotificationService->registerSubscription(
            user: $request->user(),
            payload: $request->validated(),
        );

        return $this->success(
            message: 'Push subscription refreshed successfully.',
            data: [
                'subscription' => new PushSubscriptionResource($subscription),
            ],
        );
    }

    public function destroy(RemovePushSubscriptionRequest $request): JsonResponse
    {
        $companyId = $request->validated('company_id');
        if ($companyId !== null) {
            $this->ensureCompanyMembership((int) $request->user()->id, (int) $companyId);
        }

        $updated = $this->pushNotificationService->deactivateSubscription(
            user: $request->user(),
            deviceToken: (string) $request->validated('device_token'),
        );

        return $this->success(
            message: 'Push subscription removed successfully.',
            data: ['updated' => $updated],
        );
    }

    private function ensureCompanyMembership(int $userId, int $companyId): void
    {
        $isMember = DB::table('company_users')
            ->where('user_id', $userId)
            ->where('company_id', $companyId)
            ->exists();

        if (! $isMember) {
            throw ValidationException::withMessages([
                'company_id' => ['You are not attached to the selected company context.'],
            ]);
        }
    }
}
