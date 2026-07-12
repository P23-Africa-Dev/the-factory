<?php

declare(strict_types=1);

namespace App\Services\Tracking;

use App\Models\AgentLocationSnapshot;
use App\Models\User;
use App\Services\Company\CompanyContextService;
use App\Support\AvatarUrlResolver;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class AgentLocationSnapshotService
{
    public function __construct(private readonly CompanyContextService $companyContextService) {}

    public function upsertFromTrackingEvent(array $payload): AgentLocationSnapshot
    {
        $recordedAt = isset($payload['recorded_at']) && $payload['recorded_at'] !== null
            ? Carbon::parse((string) $payload['recorded_at'])
            : now();

        AgentLocationSnapshot::query()->updateOrCreate(
            [
                'company_id' => (int) $payload['company_id'],
                'user_id' => (int) $payload['user_id'],
            ],
            [
                'task_id' => $payload['task_id'] !== null ? (int) $payload['task_id'] : null,
                'tracking_session_id' => $payload['tracking_session_id'] !== null ? (int) $payload['tracking_session_id'] : null,
                'latitude' => (float) $payload['latitude'],
                'longitude' => (float) $payload['longitude'],
                'accuracy_meters' => $payload['accuracy_meters'] !== null ? (float) $payload['accuracy_meters'] : null,
                'speed_mps' => $payload['speed_mps'] !== null ? (float) $payload['speed_mps'] : null,
                'heading_degrees' => $payload['heading_degrees'] !== null ? (float) $payload['heading_degrees'] : null,
                'event_type' => (string) $payload['event_type'],
                'task_status' => $payload['task_status'] !== null ? (string) $payload['task_status'] : null,
                'arrived' => (bool) ($payload['arrived'] ?? false),
                'recorded_at' => $recordedAt,
                'last_seen_at' => $recordedAt,
            ],
        );

        return AgentLocationSnapshot::query()
            ->with([
                'agent:id,name,email,avatar,gender,internal_role',
                'task:id,title,status,latitude,longitude,address_full,location_text,due_at',
                'trackingSession:id,task_id,start_latitude,start_longitude,near_detected_at,arrival_detected_at,destination_latitude,destination_longitude,destination_radius_meters',
            ])
            ->where('company_id', (int) $payload['company_id'])
            ->where('user_id', (int) $payload['user_id'])
            ->firstOrFail();
    }

    public function listForUser(User $actor, array $filters): array
    {
        $context = $this->companyContextService->resolve($actor, $filters['company_id'] ?? null);
        $companyId = (int) $context['company']->id;
        $role = (string) $context['role'];

        $staleAfterSeconds = $this->resolveStaleAfterSeconds($filters);

        $query = AgentLocationSnapshot::query()
            ->with([
                'agent:id,name,email,avatar,gender,internal_role',
                'task:id,title,status,latitude,longitude,address_full,location_text,due_at',
                'trackingSession:id,task_id,start_latitude,start_longitude,near_detected_at,arrival_detected_at,destination_latitude,destination_longitude,destination_radius_meters',
            ])
            ->where('company_id', $companyId)
            ->orderByDesc('last_seen_at');

        if ($role === 'agent') {
            $query->where('user_id', $actor->id);
        } elseif (! empty($filters['user_id'])) {
            $query->where('user_id', (int) $filters['user_id']);
        }

        if (! empty($filters['task_id'])) {
            $query->where('task_id', (int) $filters['task_id']);
        }

        $snapshots = $query
            ->limit((int) ($filters['limit'] ?? 200))
            ->get();

        $items = $snapshots
            ->map(fn(AgentLocationSnapshot $snapshot): array => $this->serializeSnapshot($snapshot, $staleAfterSeconds))
            ->values();

        if (! (bool) ($filters['include_offline'] ?? true)) {
            $items = $items->filter(static fn(array $item): bool => $item['status']['is_online'] === true)->values();
        }

        return [
            'items' => $items->all(),
            'meta' => [
                'company_id' => $companyId,
                'stale_after_seconds' => $staleAfterSeconds,
                'generated_at' => now()->toIso8601String(),
            ],
        ];
    }

    public function latestForUser(User $actor, User $targetUser, array $filters): array
    {
        $context = $this->companyContextService->resolve($actor, $filters['company_id'] ?? null);
        $companyId = (int) $context['company']->id;
        $role = (string) $context['role'];

        if ($role === 'agent' && (int) $actor->id !== (int) $targetUser->id) {
            throw ValidationException::withMessages([
                'authorization' => ['Agents can only access their own latest location snapshot.'],
            ]);
        }

        $memberExists = DB::table('company_users')
            ->where('company_id', $companyId)
            ->where('user_id', $targetUser->id)
            ->exists();

        if (! $memberExists) {
            throw ValidationException::withMessages([
                'user' => ['Selected user does not belong to the active company context.'],
            ]);
        }

        $snapshot = AgentLocationSnapshot::query()
            ->with([
                'agent:id,name,email,avatar,gender,internal_role',
                'task:id,title,status,latitude,longitude,address_full,location_text,due_at',
                'trackingSession:id,task_id,start_latitude,start_longitude,near_detected_at,arrival_detected_at,destination_latitude,destination_longitude,destination_radius_meters',
            ])
            ->where('company_id', $companyId)
            ->where('user_id', $targetUser->id)
            ->first();

        if (! $snapshot) {
            return [
                'snapshot' => null,
                'meta' => [
                    'company_id' => $companyId,
                    'stale_after_seconds' => $this->resolveStaleAfterSeconds($filters),
                    'generated_at' => now()->toIso8601String(),
                ],
            ];
        }

        return [
            'snapshot' => $this->serializeSnapshot($snapshot, $this->resolveStaleAfterSeconds($filters)),
            'meta' => [
                'company_id' => $companyId,
                'stale_after_seconds' => $this->resolveStaleAfterSeconds($filters),
                'generated_at' => now()->toIso8601String(),
            ],
        ];
    }

    public function resolveStaleAfterSeconds(array $filters): int
    {
        return max(60, (int) ($filters['stale_after_seconds'] ?? config('tracking.agent_location_stale_after_seconds', 300)));
    }

    private function serializeSnapshot(AgentLocationSnapshot $snapshot, int $staleAfterSeconds): array
    {
        $lastSeenAt = $snapshot->last_seen_at;
        $lastSeenIso = $lastSeenAt?->toIso8601String();
        $ageSeconds = $lastSeenAt ? max(0, now()->getTimestamp() - $lastSeenAt->getTimestamp()) : null;

        $isOnline = $ageSeconds !== null && $ageSeconds <= $staleAfterSeconds;

        $trackingSession = $snapshot->trackingSession;
        $destinationLatitude = $trackingSession?->destination_latitude ?? $snapshot->task?->latitude;
        $destinationLongitude = $trackingSession?->destination_longitude ?? $snapshot->task?->longitude;
        $arrivalRadiusMeters = (float) ($trackingSession?->destination_radius_meters ?? config('tracking.arrival_radius_meters', 75));
        $distanceToDestinationMeters =
            $destinationLatitude !== null && $destinationLongitude !== null
            ? $this->distanceMeters(
                (float) $snapshot->latitude,
                (float) $snapshot->longitude,
                (float) $destinationLatitude,
                (float) $destinationLongitude,
            )
            : null;
        $distanceRemainingMeters =
            $distanceToDestinationMeters !== null
            ? max(0.0, $distanceToDestinationMeters - max(1.0, $arrivalRadiusMeters))
            : null;
        $etaSeconds = $this->estimateEtaSeconds($distanceRemainingMeters, $snapshot->speed_mps);
        $routeDeviationMeters = $this->calculateRouteDeviationMeters(
            trackingSession: $trackingSession,
            latitude: (float) $snapshot->latitude,
            longitude: (float) $snapshot->longitude,
        );

        $taskStatus = $snapshot->task_status ?? $snapshot->task?->status?->value;
        $arrived = (bool) $snapshot->arrived || $trackingSession?->arrival_detected_at !== null;
        $nearDestination = ! $arrived && $trackingSession?->near_detected_at !== null;
        $proximityState = $taskStatus === 'completed'
            ? 'completed'
            : ($arrived ? 'arrived' : ($nearDestination ? 'near_destination' : 'in_progress'));
        $operationalStatus = $this->resolveOperationalStatus(
            taskStatus: $taskStatus,
            proximityState: $proximityState,
            isOnline: $isOnline,
            etaSeconds: $etaSeconds,
            dueAtIso: $snapshot->task?->due_at?->toIso8601String(),
        );

        return [
            'agent' => [
                'id' => $snapshot->user_id,
                'name' => $snapshot->agent?->name,
                'email' => $snapshot->agent?->email,
                'avatar' => $snapshot->agent?->avatar,
                'avatar_url' => AvatarUrlResolver::resolveOrDefault(
                    $snapshot->agent?->avatar,
                    $snapshot->agent?->gender,
                ),
                'internal_role' => $snapshot->agent?->internal_role,
            ],
            'task' => [
                'id' => $snapshot->task_id,
                'title' => $snapshot->task?->title,
                'status' => $taskStatus,
                'tracking_session_id' => $snapshot->tracking_session_id,
                'address' => $snapshot->task?->address_full,
                'location' => $snapshot->task?->location_text,
                'destination_latitude' => $destinationLatitude,
                'destination_longitude' => $destinationLongitude,
            ],
            'location' => [
                'latitude' => $snapshot->latitude,
                'longitude' => $snapshot->longitude,
                'accuracy_meters' => $snapshot->accuracy_meters,
                'speed_mps' => $snapshot->speed_mps,
                'heading_degrees' => $snapshot->heading_degrees,
                'event_type' => $snapshot->event_type,
                'arrived' => $arrived,
                'near_destination' => $nearDestination,
                'distance_to_destination_meters' => $distanceToDestinationMeters !== null ? round($distanceToDestinationMeters, 2) : null,
                'distance_remaining_meters' => $distanceRemainingMeters !== null ? round($distanceRemainingMeters, 2) : null,
                'eta_seconds' => $etaSeconds,
                'route_deviation_meters' => $routeDeviationMeters !== null ? round($routeDeviationMeters, 2) : null,
                'recorded_at' => $snapshot->recorded_at?->toIso8601String(),
            ],
            'status' => [
                'is_online' => $isOnline,
                'is_stale' => ! $isOnline,
                'stale_after_seconds' => $staleAfterSeconds,
                'age_seconds' => $ageSeconds,
                'last_seen_at' => $lastSeenIso,
                'proximity_state' => $proximityState,
                'operational_status' => $operationalStatus,
            ],
            'updated_at' => $snapshot->updated_at?->toIso8601String(),
        ];
    }

    private function estimateEtaSeconds(?float $distanceRemainingMeters, ?float $speedMps): ?int
    {
        if ($distanceRemainingMeters === null || $speedMps === null) {
            return null;
        }

        if ($distanceRemainingMeters <= 0 || $speedMps <= 0.35) {
            return null;
        }

        return (int) max(0, round($distanceRemainingMeters / $speedMps));
    }

    private function calculateRouteDeviationMeters(?object $trackingSession, float $latitude, float $longitude): ?float
    {
        if (
            $trackingSession === null
            || $trackingSession->start_latitude === null
            || $trackingSession->start_longitude === null
            || $trackingSession->destination_latitude === null
            || $trackingSession->destination_longitude === null
        ) {
            return null;
        }

        $startLat = (float) $trackingSession->start_latitude;
        $startLng = (float) $trackingSession->start_longitude;
        $destLat = (float) $trackingSession->destination_latitude;
        $destLng = (float) $trackingSession->destination_longitude;

        $latFactor = 111320.0;
        $meanLatRad = deg2rad(($startLat + $destLat + $latitude) / 3.0);
        $lngFactor = 111320.0 * cos($meanLatRad);

        $ax = 0.0;
        $ay = 0.0;
        $bx = ($destLng - $startLng) * $lngFactor;
        $by = ($destLat - $startLat) * $latFactor;
        $px = ($longitude - $startLng) * $lngFactor;
        $py = ($latitude - $startLat) * $latFactor;

        $abx = $bx - $ax;
        $aby = $by - $ay;
        $abSquared = $abx * $abx + $aby * $aby;

        if ($abSquared <= 0.0001) {
            return null;
        }

        $apx = $px - $ax;
        $apy = $py - $ay;
        $t = (($apx * $abx) + ($apy * $aby)) / $abSquared;
        $tClamped = max(0.0, min(1.0, $t));

        $closestX = $ax + ($abx * $tClamped);
        $closestY = $ay + ($aby * $tClamped);

        return sqrt((($px - $closestX) ** 2) + (($py - $closestY) ** 2));
    }

    private function resolveOperationalStatus(
        ?string $taskStatus,
        string $proximityState,
        bool $isOnline,
        ?int $etaSeconds,
        ?string $dueAtIso,
    ): string {
        if ($taskStatus === 'completed' || $proximityState === 'completed') {
            return 'completed';
        }

        if (! $isOnline) {
            return 'offline';
        }

        if ($proximityState === 'arrived') {
            return 'destination_reached';
        }

        if ($proximityState === 'near_destination') {
            return 'near_destination';
        }

        $isDelayedByEta = $etaSeconds !== null
            && $etaSeconds >= max(60, (int) config('tracking.delayed_eta_threshold_seconds', 1800));
        $isDelayedByDueAt = $dueAtIso !== null && Carbon::parse($dueAtIso)->isPast();

        if ($isDelayedByEta || $isDelayedByDueAt) {
            return 'delayed';
        }

        return 'en_route';
    }

    private function distanceMeters(float $fromLat, float $fromLng, float $toLat, float $toLng): float
    {
        $earthRadius = 6371000.0;

        $deltaLat = deg2rad($toLat - $fromLat);
        $deltaLng = deg2rad($toLng - $fromLng);

        $a = sin($deltaLat / 2) ** 2
            + cos(deg2rad($fromLat))
            * cos(deg2rad($toLat))
            * sin($deltaLng / 2) ** 2;

        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));

        return $earthRadius * $c;
    }
}
