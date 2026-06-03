<?php

declare(strict_types=1);

namespace App\Services\Notification;

use App\Enums\NotificationCategory;
use App\Models\NotificationPreference;

class NotificationPreferenceService
{
    /**
     * @return array{is_enabled: bool, in_app_enabled: bool, push_enabled: bool, email_enabled: bool, muted_until: string|null, digest_mode: string|null, quiet_hours: array|null}
     */
    public function resolve(int $userId, string $category, ?int $companyId = null): array
    {
        $category = in_array($category, NotificationCategory::values(), true)
            ? $category
            : NotificationCategory::SYSTEM->value;

        $preferences = NotificationPreference::query()
            ->where('user_id', $userId)
            ->whereIn('category', ['all', $category])
            ->where(function ($query) use ($companyId): void {
                if ($companyId !== null) {
                    $query->where('company_id', $companyId)
                        ->orWhereNull('company_id');

                    return;
                }

                $query->whereNull('company_id');
            })
            ->get();

        $resolved = [
            'is_enabled' => true,
            'in_app_enabled' => true,
            'push_enabled' => true,
            'email_enabled' => true,
            'muted_until' => null,
            'digest_mode' => null,
            'quiet_hours' => null,
        ];

        $sorted = $preferences->sortBy(function (NotificationPreference $preference) use ($companyId, $category): int {
            $score = 0;

            if ($preference->category === 'all') {
                $score += 1;
            }

            if ($preference->category === $category) {
                $score += 2;
            }

            if ($companyId !== null && (int) $preference->company_id === $companyId) {
                $score += 4;
            }

            return $score;
        });

        foreach ($sorted as $preference) {
            $resolved = [
                'is_enabled' => (bool) $preference->is_enabled,
                'in_app_enabled' => (bool) $preference->in_app_enabled,
                'push_enabled' => (bool) $preference->push_enabled,
                'email_enabled' => (bool) $preference->email_enabled,
                'muted_until' => $preference->muted_until?->toIso8601String(),
                'digest_mode' => $preference->digest_mode,
                'quiet_hours' => $preference->quiet_hours,
            ];
        }

        return $resolved;
    }

    public function muted(array $resolvedPreference): bool
    {
        $mutedUntil = $resolvedPreference['muted_until'] ?? null;

        if (! is_string($mutedUntil) || $mutedUntil === '') {
            return false;
        }

        return now()->lt($mutedUntil);
    }
}
