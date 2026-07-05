<?php

declare(strict_types=1);

namespace App\Services\Notification;

use App\Enums\NotificationCategory;
use App\Enums\NotificationDeliveryType;
use App\Enums\NotificationPriority;
use App\Jobs\DeliverPushNotificationJob;
use App\Models\AppNotification;
use App\Models\User;
use App\Services\Demo\DemoCompanyService;
use Illuminate\Contracts\Pagination\Paginator;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class NotificationService
{
    public function __construct(
        private readonly NotificationPreferenceService $notificationPreferenceService,
        private readonly NotificationRealtimeService $notificationRealtimeService,
        private readonly PushNotificationService $pushNotificationService,
        private readonly DemoCompanyService $demoCompanyService,
    ) {}

    public function notifyUser(int $userId, array $payload): ?AppNotification
    {
        $category = (string) ($payload['category'] ?? NotificationCategory::SYSTEM->value);
        $category = in_array($category, NotificationCategory::values(), true)
            ? $category
            : NotificationCategory::SYSTEM->value;

        $companyId = isset($payload['company_id']) ? (int) $payload['company_id'] : null;

        $preference = $this->notificationPreferenceService->resolve($userId, $category, $companyId);
        if (! $preference['is_enabled'] || $this->notificationPreferenceService->muted($preference)) {
            return null;
        }

        $deliveryTypes = $payload['delivery_types'] ?? [
            NotificationDeliveryType::IN_APP->value,
            NotificationDeliveryType::PUSH->value,
        ];

        $inAppVisible = $preference['in_app_enabled']
            && in_array(NotificationDeliveryType::IN_APP->value, $deliveryTypes, true);

        $pushAllowed = $preference['push_enabled']
            && in_array(NotificationDeliveryType::PUSH->value, $deliveryTypes, true);

        if ($companyId !== null && $this->demoCompanyService->isDemo($companyId)) {
            $pushAllowed = false;
        }

        $dedupeKey = $payload['dedupe_key'] ?? null;
        if (is_string($dedupeKey) && $dedupeKey !== '') {
            $existing = AppNotification::query()->where('dedupe_key', $dedupeKey)->first();
            if ($existing) {
                return $existing;
            }
        }

        $notification = AppNotification::query()->create([
            'user_id' => $userId,
            'company_id' => $companyId,
            'type' => (string) $payload['type'],
            'category' => $category,
            'title' => (string) $payload['title'],
            'message' => (string) $payload['message'],
            'reference_type' => $payload['reference_type'] ?? null,
            'reference_id' => $payload['reference_id'] ?? null,
            'action_url' => $payload['action_url'] ?? null,
            'action_route' => $payload['action_route'] ?? null,
            'metadata' => $payload['metadata'] ?? null,
            'priority' => $payload['priority'] ?? NotificationPriority::NORMAL->value,
            'delivery_types' => $deliveryTypes,
            'is_in_app_visible' => $inAppVisible,
            'is_read' => false,
            'created_by_user_id' => $payload['created_by_user_id'] ?? null,
            'dedupe_key' => $dedupeKey,
        ]);

        if ($pushAllowed) {
            $subscriptions = $this->pushNotificationService->activeSubscriptionsForUser($userId, $companyId);
            foreach ($subscriptions as $subscription) {
                DeliverPushNotificationJob::dispatch((int) $subscription->id, (int) $notification->id);
            }
        }

        $this->notificationRealtimeService->publishToUser($userId, 'notifications.created', [
            'notification_id' => $notification->id,
            'type' => $notification->type,
            'category' => $notification->category,
            'title' => $notification->title,
            'message' => $notification->message,
            'action_url' => $notification->action_url,
            'is_in_app_visible' => $notification->is_in_app_visible,
        ]);

        $this->publishUnreadCount($userId, $companyId);

        return $notification;
    }

    public function notifyUsers(array $userIds, array $payload): Collection
    {
        $notifications = collect();

        foreach (array_values(array_unique(array_map('intval', $userIds))) as $userId) {
            if ($userId <= 0) {
                continue;
            }

            $notification = $this->notifyUser($userId, $payload);
            if ($notification !== null) {
                $notifications->push($notification);
            }
        }

        return $notifications;
    }

    public function notifyCompanyRoles(int $companyId, array $roles, array $payload, array $excludeUserIds = []): Collection
    {
        $userIds = DB::table('company_users')
            ->where('company_id', $companyId)
            ->whereIn('role', $roles)
            ->whereNotIn('user_id', $excludeUserIds)
            ->pluck('user_id')
            ->map(static fn($id) => (int) $id)
            ->all();

        return $this->notifyUsers($userIds, [
            ...$payload,
            'company_id' => $companyId,
        ]);
    }

    public function listForUser(User $user, array $filters): Paginator
    {
        $query = AppNotification::query()
            ->where('user_id', $user->id)
            ->where('is_in_app_visible', true)
            ->latest('id');

        $companyId = $filters['company_id'] ?? null;
        if ($companyId !== null) {
            $this->ensureUserMembership($user->id, (int) $companyId);
            $query->where('company_id', (int) $companyId);
        }

        if (isset($filters['is_read'])) {
            $query->where('is_read', (bool) $filters['is_read']);
        }

        if (! empty($filters['category'])) {
            $query->where('category', (string) $filters['category']);
        }

        if (! empty($filters['type'])) {
            $query->where('type', (string) $filters['type']);
        }

        if (! empty($filters['priority'])) {
            $query->where('priority', (string) $filters['priority']);
        }

        return $query->simplePaginate((int) ($filters['per_page'] ?? 20))->withQueryString();
    }

    public function unreadCount(User $user, ?int $companyId = null): int
    {
        if ($companyId !== null) {
            $this->ensureUserMembership($user->id, $companyId);
        }

        return AppNotification::query()
            ->where('user_id', $user->id)
            ->where('is_in_app_visible', true)
            ->where('is_read', false)
            ->when($companyId !== null, fn($query) => $query->where('company_id', $companyId))
            ->count();
    }

    public function markRead(User $user, array $notificationIds, ?int $companyId = null): int
    {
        $query = AppNotification::query()
            ->where('user_id', $user->id)
            ->whereIn('id', $notificationIds);

        if ($companyId !== null) {
            $this->ensureUserMembership($user->id, $companyId);
            $query->where('company_id', $companyId);
        }

        $updated = $query->update([
            'is_read' => true,
            'read_at' => now(),
            'updated_at' => now(),
        ]);

        $this->publishUnreadCount($user->id, $companyId);

        return $updated;
    }

    public function markUnread(User $user, array $notificationIds, ?int $companyId = null): int
    {
        $query = AppNotification::query()
            ->where('user_id', $user->id)
            ->whereIn('id', $notificationIds);

        if ($companyId !== null) {
            $this->ensureUserMembership($user->id, $companyId);
            $query->where('company_id', $companyId);
        }

        $updated = $query->update([
            'is_read' => false,
            'read_at' => null,
            'updated_at' => now(),
        ]);

        $this->publishUnreadCount($user->id, $companyId);

        return $updated;
    }

    public function markAllRead(User $user, ?int $companyId = null): int
    {
        $query = AppNotification::query()
            ->where('user_id', $user->id)
            ->where('is_read', false);

        if ($companyId !== null) {
            $this->ensureUserMembership($user->id, $companyId);
            $query->where('company_id', $companyId);
        }

        $updated = $query->update([
            'is_read' => true,
            'read_at' => now(),
            'updated_at' => now(),
        ]);

        $this->publishUnreadCount($user->id, $companyId);

        return $updated;
    }

    public function delete(User $user, int $notificationId, ?int $companyId = null): bool
    {
        $query = AppNotification::query()
            ->where('id', $notificationId)
            ->where('user_id', $user->id);

        if ($companyId !== null) {
            $this->ensureUserMembership($user->id, $companyId);
            $query->where('company_id', $companyId);
        }

        $deleted = (bool) $query->delete();

        $this->publishUnreadCount($user->id, $companyId);

        return $deleted;
    }

    private function ensureUserMembership(int $userId, int $companyId): void
    {
        $member = DB::table('company_users')
            ->where('user_id', $userId)
            ->where('company_id', $companyId)
            ->exists();

        if (! $member) {
            throw ValidationException::withMessages([
                'company_id' => ['You are not attached to the selected company context.'],
            ]);
        }
    }

    private function publishUnreadCount(int $userId, ?int $companyId = null): void
    {
        $count = AppNotification::query()
            ->where('user_id', $userId)
            ->where('is_in_app_visible', true)
            ->where('is_read', false)
            ->when($companyId !== null, fn($query) => $query->where('company_id', $companyId))
            ->count();

        $this->notificationRealtimeService->publishToUser($userId, 'notifications.unread_count.updated', [
            'company_id' => $companyId,
            'unread_count' => $count,
        ]);
    }
}
