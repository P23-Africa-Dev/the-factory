<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Tracking;

use App\Http\Controllers\Controller;
use App\Http\Requests\Tracking\AgentPresenceHeartbeatRequest;
use App\Models\AgentLocationSnapshot;
use App\Models\TaskTrackingSession;
use App\Services\Company\CompanyContextService;
use App\Services\Tracking\AgentLocationSnapshotService;
use App\Services\Workforce\AgentPresenceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;

class AgentPresenceController extends Controller
{
    public function __construct(
        private readonly AgentLocationSnapshotService $snapshotService,
        private readonly CompanyContextService $companyContextService,
        private readonly AgentPresenceService $presenceService,
    ) {}

    public function heartbeat(AgentPresenceHeartbeatRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $actor = $request->user();
        $context = $this->companyContextService->resolve($actor, $validated['company_id']);
        $companyId = (int) $context['company']->id;

        $latitude = $validated['latitude'] ?? null;
        $longitude = $validated['longitude'] ?? null;

        if ($latitude === null || $longitude === null) {
            throw ValidationException::withMessages([
                'location' => ['Latitude and longitude are required for map presence heartbeat.'],
            ]);
        }

        $existing = AgentLocationSnapshot::query()
            ->where('company_id', $companyId)
            ->where('user_id', (int) $actor->id)
            ->first();

        if (
            $existing?->task_id !== null
            && $existing->last_seen_at !== null
            && $existing->last_seen_at->greaterThanOrEqualTo($this->presenceService->mapActiveCutoff())
        ) {
            return $this->success(
                message: 'Agent task tracking already provides live map presence.',
                data: [
                    'snapshot_id' => $existing->id,
                    'last_seen_at' => $existing->last_seen_at->toIso8601String(),
                ],
            );
        }

        $hasActiveTrackingSession = TaskTrackingSession::query()
            ->where('company_id', $companyId)
            ->where('started_by_user_id', (int) $actor->id)
            ->whereNull('end_recorded_at')
            ->exists();

        if ($hasActiveTrackingSession) {
            return $this->success(
                message: 'Agent has an open tracking session; map presence heartbeat skipped.',
                data: [
                    'snapshot_id' => $existing?->id,
                    'last_seen_at' => $existing?->last_seen_at?->toIso8601String(),
                ],
            );
        }

        $snapshot = $this->snapshotService->upsertFromTrackingEvent([
            'company_id' => $companyId,
            'user_id' => (int) $actor->id,
            'task_id' => null,
            'tracking_session_id' => null,
            'latitude' => (float) $latitude,
            'longitude' => (float) $longitude,
            'accuracy_meters' => isset($validated['accuracy_meters']) ? (float) $validated['accuracy_meters'] : null,
            'speed_mps' => null,
            'heading_degrees' => null,
            'event_type' => 'map_presence',
            'task_status' => null,
            'arrived' => false,
            'recorded_at' => now()->toIso8601String(),
        ]);

        return $this->success(
            message: 'Agent presence heartbeat recorded.',
            data: [
                'snapshot_id' => $snapshot->id,
                'last_seen_at' => $snapshot->last_seen_at?->toIso8601String(),
            ],
        );
    }
}
