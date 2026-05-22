<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Notification;

use App\Http\Controllers\Controller;
use App\Http\Requests\Notification\BatchNotificationStateRequest;
use App\Http\Requests\Notification\ListNotificationsRequest;
use App\Http\Requests\Notification\MarkAllNotificationsReadRequest;
use App\Http\Resources\AppNotificationResource;
use App\Models\AppNotification;
use App\Services\Notification\NotificationService;
use Illuminate\Http\JsonResponse;

class NotificationController extends Controller
{
    public function __construct(private readonly NotificationService $notificationService) {}

    public function index(ListNotificationsRequest $request): JsonResponse
    {
        $notifications = $this->notificationService->listForUser(
            user: $request->user(),
            filters: $request->validated(),
        );

        return $this->success(
            message: 'Notifications fetched successfully.',
            data: [
                'items' => AppNotificationResource::collection($notifications->items()),
                'pagination' => [
                    'next_page_url' => $notifications->nextPageUrl(),
                    'prev_page_url' => $notifications->previousPageUrl(),
                    'per_page' => $notifications->perPage(),
                ],
            ],
        );
    }

    public function history(ListNotificationsRequest $request): JsonResponse
    {
        $filters = $request->validated();
        $filters['is_read'] = $request->has('is_read')
            ? $request->boolean('is_read')
            : null;

        $notifications = $this->notificationService->listForUser(
            user: $request->user(),
            filters: $filters,
        );

        return $this->success(
            message: 'Notification history fetched successfully.',
            data: [
                'items' => AppNotificationResource::collection($notifications->items()),
                'pagination' => [
                    'next_page_url' => $notifications->nextPageUrl(),
                    'prev_page_url' => $notifications->previousPageUrl(),
                    'per_page' => $notifications->perPage(),
                ],
            ],
        );
    }

    public function unreadCount(MarkAllNotificationsReadRequest $request): JsonResponse
    {
        $companyId = $request->validated('company_id');

        $count = $this->notificationService->unreadCount(
            user: $request->user(),
            companyId: $companyId !== null ? (int) $companyId : null,
        );

        return $this->success(
            message: 'Unread notification count fetched successfully.',
            data: [
                'unread_count' => $count,
            ],
        );
    }

    public function markRead(BatchNotificationStateRequest $request): JsonResponse
    {
        $companyId = $request->validated('company_id');

        $updated = $this->notificationService->markRead(
            user: $request->user(),
            notificationIds: array_map('intval', $request->validated('notification_ids')),
            companyId: $companyId !== null ? (int) $companyId : null,
        );

        return $this->success(
            message: 'Notifications marked as read successfully.',
            data: ['updated' => $updated],
        );
    }

    public function markUnread(BatchNotificationStateRequest $request): JsonResponse
    {
        $companyId = $request->validated('company_id');

        $updated = $this->notificationService->markUnread(
            user: $request->user(),
            notificationIds: array_map('intval', $request->validated('notification_ids')),
            companyId: $companyId !== null ? (int) $companyId : null,
        );

        return $this->success(
            message: 'Notifications marked as unread successfully.',
            data: ['updated' => $updated],
        );
    }

    public function markAllRead(MarkAllNotificationsReadRequest $request): JsonResponse
    {
        $companyId = $request->validated('company_id');

        $updated = $this->notificationService->markAllRead(
            user: $request->user(),
            companyId: $companyId !== null ? (int) $companyId : null,
        );

        return $this->success(
            message: 'All notifications marked as read successfully.',
            data: ['updated' => $updated],
        );
    }

    public function destroy(MarkAllNotificationsReadRequest $request, AppNotification $notification): JsonResponse
    {
        $companyId = $request->validated('company_id');

        $deleted = $this->notificationService->delete(
            user: $request->user(),
            notificationId: (int) $notification->id,
            companyId: $companyId !== null ? (int) $companyId : null,
        );

        return $this->success(
            message: $deleted ? 'Notification deleted successfully.' : 'Notification not found.',
            data: ['deleted' => $deleted],
        );
    }
}
