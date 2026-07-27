<?php

declare(strict_types=1);

namespace App\Services\Places;

use App\Models\Company;
use App\Models\User;
use App\Models\UserPlaceRecent;
use Illuminate\Support\Collection;

final class UserPlaceRecentsService
{
    public const MAX_PER_USER = 15;

    /**
     * @return list<array<string, mixed>>
     */
    public function listForUser(User $user, int $limit = self::MAX_PER_USER): array
    {
        $limit = max(1, min(self::MAX_PER_USER, $limit));

        return UserPlaceRecent::query()
            ->where('user_id', $user->id)
            ->orderByDesc('last_used_at')
            ->limit($limit)
            ->get()
            ->map(static fn (UserPlaceRecent $row): array => $row->toApiArray())
            ->all();
    }

    /**
     * @param  array{
     *   name: string,
     *   address?: string|null,
     *   latitude: float,
     *   longitude: float,
     *   provider?: string|null,
     *   provider_place_id?: string|null
     * }  $payload
     * @return array<string, mixed>
     */
    public function remember(User $user, array $payload, ?Company $company = null): array
    {
        $name = trim((string) ($payload['name'] ?? ''));
        $lat = (float) $payload['latitude'];
        $lng = (float) $payload['longitude'];
        $provider = isset($payload['provider']) ? trim((string) $payload['provider']) : null;
        $providerPlaceId = isset($payload['provider_place_id'])
            ? trim((string) $payload['provider_place_id'])
            : null;
        $address = isset($payload['address']) ? trim((string) $payload['address']) : null;

        if ($name === '' || ! is_finite($lat) || ! is_finite($lng)) {
            throw new \InvalidArgumentException('name, latitude, and longitude are required.');
        }

        $existing = $this->findExisting($user, $lat, $lng, $provider, $providerPlaceId);

        if ($existing !== null) {
            $existing->fill([
                'name' => $name,
                'address' => $address !== '' ? $address : $existing->address,
                'latitude' => $lat,
                'longitude' => $lng,
                'provider' => $provider !== '' ? $provider : $existing->provider,
                'provider_place_id' => $providerPlaceId !== '' ? $providerPlaceId : $existing->provider_place_id,
                'company_id' => $company?->id ?? $existing->company_id,
                'last_used_at' => now(),
            ]);
            $existing->save();
            $this->trimExcess($user);

            return $existing->fresh()->toApiArray();
        }

        $row = UserPlaceRecent::query()->create([
            'user_id' => $user->id,
            'company_id' => $company?->id,
            'name' => $name,
            'address' => $address !== '' ? $address : null,
            'latitude' => $lat,
            'longitude' => $lng,
            'provider' => $provider !== '' ? $provider : null,
            'provider_place_id' => $providerPlaceId !== '' ? $providerPlaceId : null,
            'last_used_at' => now(),
        ]);

        $this->trimExcess($user);

        return $row->toApiArray();
    }

    public function forget(User $user, int $id): bool
    {
        $deleted = UserPlaceRecent::query()
            ->where('user_id', $user->id)
            ->where('id', $id)
            ->delete();

        return $deleted > 0;
    }

    private function findExisting(
        User $user,
        float $lat,
        float $lng,
        ?string $provider,
        ?string $providerPlaceId,
    ): ?UserPlaceRecent {
        if ($provider !== null && $provider !== '' && $providerPlaceId !== null && $providerPlaceId !== '') {
            $byProvider = UserPlaceRecent::query()
                ->where('user_id', $user->id)
                ->where('provider', $provider)
                ->where('provider_place_id', $providerPlaceId)
                ->first();
            if ($byProvider !== null) {
                return $byProvider;
            }
        }

        // Soft dedupe by rounded coords (~11m at equator for 4 decimal places).
        $latRounded = round($lat, 4);
        $lngRounded = round($lng, 4);

        /** @var Collection<int, UserPlaceRecent> $candidates */
        $candidates = UserPlaceRecent::query()
            ->where('user_id', $user->id)
            ->get();

        foreach ($candidates as $row) {
            if (round((float) $row->latitude, 4) === $latRounded
                && round((float) $row->longitude, 4) === $lngRounded) {
                return $row;
            }
        }

        return null;
    }

    private function trimExcess(User $user): void
    {
        $keepIds = UserPlaceRecent::query()
            ->where('user_id', $user->id)
            ->orderByDesc('last_used_at')
            ->limit(self::MAX_PER_USER)
            ->pluck('id');

        if ($keepIds->isEmpty()) {
            return;
        }

        UserPlaceRecent::query()
            ->where('user_id', $user->id)
            ->whereNotIn('id', $keepIds)
            ->delete();
    }
}
