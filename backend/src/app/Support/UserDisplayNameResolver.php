<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\User;

final class UserDisplayNameResolver
{
    /**
     * @param  array<int, int|string|null>  $userIds
     * @return array<int, string>
     */
    public function resolveMap(array $userIds): array
    {
        $ids = collect($userIds)
            ->filter(static fn (mixed $id): bool => is_numeric($id) && (int) $id > 0)
            ->map(static fn (mixed $id): int => (int) $id)
            ->unique()
            ->values()
            ->all();

        if ($ids === []) {
            return [];
        }

        return User::query()
            ->whereIn('id', $ids)
            ->pluck('name', 'id')
            ->map(static fn (mixed $name): string => trim((string) $name))
            ->all();
    }

    /**
     * @param  array<int, string>  $nameMap
     */
    public function label(?int $userId, array $nameMap, string $fallback = 'Unassigned'): string
    {
        if ($userId === null || $userId <= 0) {
            return $fallback;
        }

        $name = trim((string) ($nameMap[$userId] ?? ''));

        return $name !== '' ? $name : $fallback;
    }

    /**
     * @param  array<int, int|string|null>  $userIds
     * @param  array<int, string>  $nameMap
     * @return array<int, string>
     */
    public function labelsForIds(array $userIds, array $nameMap, string $fallback = 'Unassigned'): array
    {
        return collect($userIds)
            ->filter(static fn (mixed $id): bool => is_numeric($id) && (int) $id > 0)
            ->map(fn (mixed $id): string => $this->label((int) $id, $nameMap, $fallback))
            ->unique()
            ->values()
            ->all();
    }
}
