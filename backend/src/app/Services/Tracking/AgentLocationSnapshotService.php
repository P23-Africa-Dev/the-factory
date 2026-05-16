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
            ->with(['agent:id,name,email,avatar,gender,internal_role', 'task:id,title,status,address_full,location_text,latitude,longitude'])
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
            ->with(['agent:id,name,email,avatar,gender,internal_role', 'task:id,title,status,address_full,location_text,latitude,longitude'])
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
            ->with(['agent:id,name,email,avatar,gender,internal_role', 'task:id,title,status,address_full,location_text,latitude,longitude'])
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

        return [
            'agent' => [
                'id' => $snapshot->user_id,
                'name' => $snapshot->agent?->name,
                'email' => $snapshot->agent?->email,
                'avatar' => $snapshot->agent?->avatar,
                'avatar_url' => AvatarUrlResolver::resolve(
                    $snapshot->agent?->avatar,
                    $snapshot->agent?->gender,
                ),
                'internal_role' => $snapshot->agent?->internal_role,
            ],
            'task' => [
                'id' => $snapshot->task_id,
                'title' => $snapshot->task?->title,
                'status' => $snapshot->task_status ?? $snapshot->task?->status?->value,
                'tracking_session_id' => $snapshot->tracking_session_id,
                'address' => $snapshot->task?->address_full,
                'location' => $snapshot->task?->location_text,
                'destination_latitude' => $snapshot->task?->latitude,
                'destination_longitude' => $snapshot->task?->longitude,
            ],
            'location' => [
                'latitude' => $snapshot->latitude,
                'longitude' => $snapshot->longitude,
                'accuracy_meters' => $snapshot->accuracy_meters,
                'speed_mps' => $snapshot->speed_mps,
                'heading_degrees' => $snapshot->heading_degrees,
                'event_type' => $snapshot->event_type,
                'arrived' => $snapshot->arrived,
                'recorded_at' => $snapshot->recorded_at?->toIso8601String(),
            ],
            'status' => [
                'is_online' => $isOnline,
                'is_stale' => ! $isOnline,
                'stale_after_seconds' => $staleAfterSeconds,
                'age_seconds' => $ageSeconds,
                'last_seen_at' => $lastSeenIso,
            ],
            'updated_at' => $snapshot->updated_at?->toIso8601String(),
        ];
    }
}
