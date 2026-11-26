<?php

declare(strict_types=1);

namespace App\Services\FieldActivity;

use App\Enums\FieldActivitySessionStatus;
use App\Enums\FieldMovementState;
use App\Enums\FieldStopClassification;
use App\Enums\FieldStopClassifiedBy;
use App\Enums\NotificationCategory;
use App\Enums\NotificationPriority;
use App\Jobs\EnrichFieldStopsJob;
use App\Jobs\ProcessFieldStopsJob;
use App\Models\AttendanceRecord;
use App\Models\Company;
use App\Models\FieldActivitySession;
use App\Models\FieldDailySummary;
use App\Models\FieldLocationPoint;
use App\Models\FieldStop;
use App\Models\Lead;
use App\Models\TaskTrackingSession;
use App\Models\User;
use App\Services\Attendance\AttendanceAccessService;
use App\Services\Notification\NotificationService;
use App\Services\Tracking\AgentLocationSnapshotService;
use App\Support\ClientTime;
use App\Support\CompanyClock;
use App\Support\GeoDistance;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Throwable;

class FieldActivitySessionService
{
    /** Points for a field trip arrive through /field-trips/{id}/points. */
    public const ENDPOINT_FIELD_TRIP = 'field_trip';

    /** Legacy /agent/field-activity/sessions/{id}/points (clock-in sessions only). */
    public const ENDPOINT_LEGACY = 'legacy';

    /** Fixes worse than this are noise (cell/Wi-Fi guesses): dropped server-side. */
    public const MAX_ACCURACY_METERS = 250.0;

    /** Faster than this (≈250 km/h) from the last accepted fix is a GPS jump. */
    public const MAX_IMPLIED_SPEED_MPS = 70.0;

    /** Late points for an auto-ended trip are accepted up to this long after its end. */
    public const LATE_POINT_GRACE_SECONDS = 600;

    public function __construct(
        private readonly AttendanceAccessService $attendanceAccessService,
        private readonly FieldActivitySettingService $settingService,
        private readonly FieldMovementEngine $movementEngine,
        private readonly FieldStopDetectionService $stopDetectionService,
        private readonly FieldDailySummaryService $dailySummaryService,
        private readonly FieldCrmBridgeService $crmBridgeService,
        private readonly AgentLocationSnapshotService $snapshotService,
        private readonly NotificationService $notificationService,
        private readonly FieldActivityRealtimeService $realtimeService,
    ) {}

    public function startForAttendance(AttendanceRecord $record, Company $company): ?FieldActivitySession
    {
        if (! $this->settingService->isEnabledForCompany($company)) {
            Log::info('field_activity.lifecycle.start_skipped_disabled', [
                'company_id' => $company->id,
                'attendance_record_id' => $record->id,
                'user_id' => $record->user_id,
            ]);
            return null;
        }

        $existing = FieldActivitySession::query()
            ->where('attendance_record_id', $record->id)
            ->where('status', FieldActivitySessionStatus::ACTIVE)
            ->first();

        if ($existing !== null) {
            Log::info('field_activity.lifecycle.start_reused_active', [
                'company_id' => $company->id,
                'attendance_record_id' => $record->id,
                'user_id' => $record->user_id,
                'session_id' => $existing->id,
            ]);
            return $existing;
        }

        // Close any stale active sessions for this user properly (stops + summary).
        $staleClosed = 0;
        FieldActivitySession::query()
            ->where('company_id', $company->id)
            ->where('user_id', $record->user_id)
            ->where('status', FieldActivitySessionStatus::ACTIVE)
            ->get()
            ->each(function (FieldActivitySession $stale) use (&$staleClosed): void {
                $this->completeSession($stale, $stale->last_recorded_at ?? now(), autoClosed: true, endReason: FieldActivitySession::END_REASON_AUTO_LEGACY);
                $staleClosed++;
            });

        $meta = is_array($record->metadata) ? $record->metadata : [];

        $session = FieldActivitySession::query()->create([
            'company_id' => $company->id,
            'user_id' => $record->user_id,
            'attendance_record_id' => $record->id,
            'status' => FieldActivitySessionStatus::ACTIVE,
            'started_at' => $record->clock_in_at ?? now(),
            'last_latitude' => isset($meta['clock_in_latitude']) ? (float) $meta['clock_in_latitude'] : null,
            'last_longitude' => isset($meta['clock_in_longitude']) ? (float) $meta['clock_in_longitude'] : null,
            'last_accuracy_meters' => isset($meta['clock_in_accuracy_m']) ? (float) $meta['clock_in_accuracy_m'] : null,
            'last_recorded_at' => $record->clock_in_at ?? now(),
            'last_received_at' => now(),
            'last_movement_state' => FieldMovementState::STOPPED,
        ]);

        $seededPoint = $this->seedInitialPointFromClockIn($session, $record, $meta);

        Log::info('field_activity.lifecycle.session_started', [
            'company_id' => $company->id,
            'attendance_record_id' => $record->id,
            'user_id' => $record->user_id,
            'session_id' => $session->id,
            'stale_sessions_closed' => $staleClosed,
            'seed_point_persisted' => $seededPoint,
        ]);

        return $session->fresh() ?? $session;
    }

    public function endForAttendance(
        AttendanceRecord $record,
        bool $autoClosed = false,
        bool $withNarrative = false,
    ): ?FieldDailySummary {
        $session = FieldActivitySession::query()
            ->where('attendance_record_id', $record->id)
            ->where('status', FieldActivitySessionStatus::ACTIVE)
            ->first();


        if ($session === null) {
            // Normal since Field Trips: clock-in no longer opens a session.
            Log::debug('field_activity.lifecycle.end_missing_session', [
                'attendance_record_id' => $record->id,
                'company_id' => $record->company_id,
                'user_id' => $record->user_id,
                'auto_closed' => $autoClosed,
            ]);
            return null;
        }

        return $this->completeSession(
            $session,
            $record->clock_out_at ?? now(),
            $autoClosed,
            $withNarrative,
        );
    }

    /**
     * Ends the session if it is still active; otherwise just (re)builds its summary.
     */
    public function completeSession(
        FieldActivitySession $session,
        Carbon|string|null $endedAt = null,
        bool $autoClosed = false,
        bool $withNarrative = false,
        ?string $endReason = null,
    ): FieldDailySummary {
        return $this->completeSessionIfActive($session, $endedAt, $autoClosed, $withNarrative, $endReason)
            ?? $this->dailySummaryService->buildForSession($session->fresh() ?? $session, $withNarrative);
    }

    /**
     * Ends the session under a row lock. Returns null when it was no longer
     * active (ended concurrently by the user, the monitor or another request),
     * so callers publish "trip ended" / notify exactly once.
     */
    public function completeSessionIfActive(
        FieldActivitySession $session,
        Carbon|string|null $endedAt = null,
        bool $autoClosed = false,
        bool $withNarrative = false,
        ?string $endReason = null,
    ): ?FieldDailySummary {
        $ended = $endedAt instanceof Carbon ? $endedAt->copy() : ClientTime::parse($endedAt);
        $reason = $endReason ?? ($autoClosed ? FieldActivitySession::END_REASON_AUTO_LEGACY : FieldActivitySession::END_REASON_USER);
        $affected = [];

        $closed = DB::transaction(function () use ($session, &$ended, $autoClosed, $reason, &$affected): ?FieldActivitySession {
            $locked = FieldActivitySession::query()->lockForUpdate()->find($session->id);
            if ($locked === null || ! $locked->isActive()) {
                return null;
            }

            if ($locked->started_at !== null && $ended->lt($locked->started_at)) {
                $ended = $locked->started_at->copy();
            }

            $affected = $this->stopDetectionService->finalizeOpenStops($locked, $ended);

            $meta = is_array($locked->meta) ? $locked->meta : [];
            if ($reason === FieldActivitySession::END_REASON_AUTO_NO_SIGNAL) {
                // Late points are accepted relative to the original auto-end.
                $meta['auto_ended_at'] = $ended->toIso8601String();
            }

            $updated = FieldActivitySession::query()
                ->whereKey($locked->id)
                ->where('status', FieldActivitySessionStatus::ACTIVE->value)
                ->update([
                    'status' => ($autoClosed ? FieldActivitySessionStatus::AUTO_CLOSED : FieldActivitySessionStatus::COMPLETED)->value,
                    'ended_at' => $ended->copy()->setTimezone((string) config('app.timezone'))->format('Y-m-d H:i:s'),
                    'end_reason' => $reason,
                    'meta' => json_encode($meta, JSON_THROW_ON_ERROR),
                    'updated_at' => now()->format('Y-m-d H:i:s'),
                ]);

            return $updated === 1 ? $locked : null;
        });

        $session->refresh();

        if ($closed === null) {
            return null;
        }

        if ($affected !== []) {
            EnrichFieldStopsJob::dispatch($affected);
        }

        $session->refresh();
        $summary = $this->dailySummaryService->buildForSession($session, $withNarrative);

        $this->notifyEndOfDayReview($session, $summary);

        Log::info('field_activity.lifecycle.session_completed', [
            'session_id' => $session->id,
            'company_id' => $session->company_id,
            'user_id' => $session->user_id,
            'auto_closed' => $autoClosed,
            'end_reason' => $reason,
            'ended_at' => $ended->toIso8601String(),
            'distance_meters' => (int) $session->distance_meters,
            'stop_count' => (int) $session->stop_count,
            'visit_count' => (int) $session->visit_count,
            'unknown_stop_count' => (int) $session->unknown_stop_count,
        ]);

        return $summary;
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  string  $endpoint  ENDPOINT_FIELD_TRIP or ENDPOINT_LEGACY
     * @return array<string, mixed>
     */
    public function recordPoints(User $user, FieldActivitySession $session, array $data, string $endpoint = self::ENDPOINT_LEGACY): array
    {
        // Any role may record points for their OWN session (field trips are for
        // agents and managers alike); ownership is the access rule.
        $context = $this->attendanceAccessService->resolve($user, $data['company_id'] ?? $session->company_id);

        if ((int) $session->company_id !== (int) $context->company->id
            || (int) $session->user_id !== (int) $user->id) {
            throw ValidationException::withMessages([
                'session' => ['Field activity session not found for this user.'],
            ]);
        }

        // Field trips only take positions from the phone, through the trip
        // endpoint. The desktop web reporter must not mix laptop positions in.
        if ($endpoint !== self::ENDPOINT_FIELD_TRIP && $session->isFieldTrip()) {
            throw ValidationException::withMessages([
                'session' => ['Field trip locations are only accepted from the mobile app.'],
            ]);
        }

        if (! $this->settingService->isEnabledForCompany($context->company)) {
            throw ValidationException::withMessages([
                'field_activity' => ['Field Activity Intelligence is not enabled for this organization.'],
            ]);
        }

        if (! $session->isActive() && ! $this->acceptsLatePoints($session)) {
            throw ValidationException::withMessages([
                'session' => ['Field activity session is not active.'],
            ]);
        }

        $rawPoints = $data['points'] ?? null;
        if (! is_array($rawPoints) || $rawPoints === []) {
            // Single-point payload compatibility.
            $rawPoints = [[
                'latitude' => $data['latitude'] ?? null,
                'longitude' => $data['longitude'] ?? null,
                'accuracy_meters' => $data['accuracy_meters'] ?? null,
                'speed_mps' => $data['speed_mps'] ?? null,
                'heading_degrees' => $data['heading_degrees'] ?? null,
                'recorded_at' => $data['recorded_at'] ?? null,
                'task_tracking_session_id' => $data['task_tracking_session_id'] ?? null,
                'client_point_id' => $data['client_point_id'] ?? null,
            ]];
        }

        $maxBatch = (int) config('field_activity.max_batch_points', 50);
        if (count($rawPoints) > $maxBatch) {
            throw ValidationException::withMessages([
                'points' => ["A maximum of {$maxBatch} points can be submitted per request."],
            ]);
        }

        // Sort by actual instant, not string: mixed offsets ("+01:00" vs "Z")
        // sort wrongly as text.
        usort($rawPoints, static function (array $a, array $b): int {
            return ClientTime::parse($a['recorded_at'] ?? null)->getTimestamp()
                <=> ClientTime::parse($b['recorded_at'] ?? null)->getTimestamp();
        });

        // Replayed offline batches: skip points this session already stored.
        $clientIds = array_values(array_filter(array_map(
            static fn (array $p): ?string => isset($p['client_point_id']) && is_string($p['client_point_id']) ? $p['client_point_id'] : null,
            $rawPoints,
        )));
        if ($clientIds !== []) {
            $seen = FieldLocationPoint::query()
                ->where('field_activity_session_id', $session->id)
                ->whereIn('client_point_id', $clientIds)
                ->pluck('client_point_id')
                ->all();
            if ($seen !== []) {
                $seenSet = array_flip($seen);
                $rawPoints = array_values(array_filter(
                    $rawPoints,
                    static fn (array $p): bool => ! isset($p['client_point_id']) || ! isset($seenSet[$p['client_point_id']]),
                ));
            }
        }

        $activeTaskSession = TaskTrackingSession::query()
            ->where('company_id', $session->company_id)
            ->where('started_by_user_id', $user->id)
            ->whereNull('end_recorded_at')
            ->orderByDesc('id')
            ->first();

        $counts = ['persisted' => 0, 'trail' => 0, 'gated' => 0, 'rejected' => 0];
        $latest = null;
        $late = false;
        $affectedStops = [];

        DB::transaction(function () use ($session, $user, $rawPoints, $activeTaskSession, &$counts, &$latest, &$late, &$affectedStops): void {
            // Re-check under the lock: End / auto-end may have won the race.
            $locked = FieldActivitySession::query()->lockForUpdate()->findOrFail($session->id);
            $late = ! $locked->isActive();
            if ($late && ! $this->acceptsLatePoints($locked)) {
                throw ValidationException::withMessages([
                    'session' => ['Field activity session is not active.'],
                ]);
            }

            // Server receive time: drives signal-lost / auto-end, immune to device clocks.
            $locked->last_received_at = now();
            $originalEnd = $locked->ended_at?->copy();
            $lateLimit = $late ? $this->latePointLimit($locked) : null;

            foreach ($rawPoints as $raw) {
                $outcome = $this->ingestPoint($locked, $user, $raw, $activeTaskSession, $lateLimit);
                $counts[$outcome['status']]++;
                if (in_array($outcome['status'], ['persisted', 'gated'], true)) {
                    $latest = $outcome['raw'];
                }
            }

            if ($late && $counts['persisted'] + $counts['trail'] > 0) {
                // Points recorded offline before the auto-end: extend the trip to
                // its last known position and rebuild its stops.
                if ($locked->last_recorded_at !== null && $locked->ended_at !== null
                    && $locked->last_recorded_at->gt($locked->ended_at)) {
                    $locked->ended_at = $locked->last_recorded_at->copy();
                }
                $locked->save();

                // Stops closed only because the trip was auto-ended reopen, so the
                // late trail can extend or close them at their real departure.
                FieldStop::query()
                    ->where('field_activity_session_id', $locked->id)
                    ->whereNotNull('departed_at')
                    ->where('departed_at', '>=', $originalEnd)
                    ->update(['departed_at' => null]);
                $this->stopDetectionService->resetScanCursor($locked);
                $affectedStops = $this->stopDetectionService->finalizeOpenStops($locked, $locked->ended_at);
            } else {
                $locked->save();
            }
        });

        $session = $session->fresh() ?? $session;
        $stored = $counts['persisted'] + $counts['trail'];

        if ($late) {
            if ($stored > 0) {
                $this->dailySummaryService->buildForSession($session);
                if ($affectedStops !== []) {
                    EnrichFieldStopsJob::dispatch($affectedStops);
                }
            }
        } else {
            if ($stored > 0) {
                ProcessFieldStopsJob::dispatch((int) $session->id);
            }
            if ($latest !== null) {
                // A task in progress keeps its own live snapshot (task tracking).
                if ($activeTaskSession === null) {
                    $this->upsertLiveSnapshot($session, $latest);
                }
                $this->realtimeService->publishLastKnownLocation($session);
            }
        }

        Log::debug('field_activity.lifecycle.points_ingested', [
            'session_id' => $session->id,
            'company_id' => $session->company_id,
            'user_id' => $session->user_id,
            'received_count' => count($rawPoints),
            'persisted_count' => $stored,
            'rejected_count' => $counts['rejected'],
            'late' => $late,
        ]);

        $session = $session->fresh() ?? $session;

        return [
            'session' => $this->serializeSession($session),
            'persisted_count' => $stored,
            'rejected_count' => $counts['rejected'],
            'stops_created' => FieldStop::query()
                ->where('field_activity_session_id', $session->id)
                ->count(),
        ];
    }

    /** Auto-ended (no signal) trips still take the points the phone buffered offline. */
    public function acceptsLatePoints(FieldActivitySession $session): bool
    {
        return ! $session->isActive()
            && $session->end_reason === FieldActivitySession::END_REASON_AUTO_NO_SIGNAL
            && $session->ended_at !== null;
    }

    private function latePointLimit(FieldActivitySession $session): Carbon
    {
        $meta = is_array($session->meta) ? $session->meta : [];
        $endedAt = isset($meta['auto_ended_at']) && is_string($meta['auto_ended_at'])
            ? ClientTime::parse($meta['auto_ended_at'])
            : ($session->ended_at ?? now());

        return $endedAt->copy()->addSeconds(self::LATE_POINT_GRACE_SECONDS);
    }

    /**
     * Applies one sample to the (locked) session. The session is saved by the caller.
     *
     * - rejected: invalid, too inaccurate, before the trip, past the late window, or an impossible jump;
     * - trail:    older than the session's time cursor (out of order): stored for the route only;
     * - persisted / gated: in order; advances the live position, time and distance,
     *   and is stored on the trail unless the persist gate thins it out.
     *
     * @param  array<string, mixed>  $raw
     * @return array{status: 'persisted'|'trail'|'gated'|'rejected', raw: array<string, mixed>|null}
     */
    private function ingestPoint(
        FieldActivitySession $session,
        User $user,
        array $raw,
        ?TaskTrackingSession $activeTaskSession,
        ?Carbon $lateLimit,
    ): array {
        $rejected = ['status' => 'rejected', 'raw' => null];

        if (! isset($raw['latitude'], $raw['longitude'])) {
            return $rejected;
        }

        $lat = (float) $raw['latitude'];
        $lng = (float) $raw['longitude'];
        if (! GeoDistance::isValidCoordinate($lat, $lng)) {
            return $rejected;
        }

        $accuracy = isset($raw['accuracy_meters']) && is_numeric($raw['accuracy_meters']) ? (float) $raw['accuracy_meters'] : null;
        if ($accuracy !== null && $accuracy > self::MAX_ACCURACY_METERS) {
            return $rejected;
        }

        $speed = isset($raw['speed_mps']) && is_numeric($raw['speed_mps']) && (float) $raw['speed_mps'] >= 0
            ? (float) $raw['speed_mps']
            : null;

        // Clamp device clocks: never in the future, never before the session.
        $recordedAt = ClientTime::parse($raw['recorded_at'] ?? null);
        if ($recordedAt->gt(now()->addSeconds(120))) {
            $recordedAt = now();
        }
        if ($session->started_at !== null && $recordedAt->lt($session->started_at->copy()->subMinutes(5))) {
            return $rejected;
        }
        if ($lateLimit !== null && $recordedAt->gt($lateLimit)) {
            return $rejected;
        }

        $cursor = $session->last_recorded_at;

        // Out of order (older than what we already applied): keep it on the
        // trail, but never rewind position, time, distance or the live map.
        if ($cursor !== null && $recordedAt->lt($cursor)) {
            $this->createPoint($session, $user, $raw, $lat, $lng, $accuracy, $speed, $recordedAt, 0.0,
                $this->movementEngine->classifyMovement($speed !== null ? $speed * 3.6 : null, 0.0),
                null, $activeTaskSession);

            return ['status' => 'trail', 'raw' => null];
        }

        // Impossible jump from the last accepted fix. The start fix is exempt
        // (phones often hand a stale cached position on "Start"): a jump from
        // it re-anchors the trip without crediting distance.
        $hasPrevious = $session->last_latitude !== null && $session->last_longitude !== null;
        $reanchor = false;
        if ($hasPrevious && $cursor !== null) {
            $step = GeoDistance::haversineMeters((float) $session->last_latitude, (float) $session->last_longitude, $lat, $lng);
            $dt = max(1.0, (float) $cursor->diffInSeconds($recordedAt));
            if ($step / $dt > self::MAX_IMPLIED_SPEED_MPS) {
                $fromStartFix = $session->started_at !== null && $cursor->lte($session->started_at);
                if (! $fromStartFix) {
                    return $rejected;
                }
                $reanchor = true;
            }
        }

        $interpreted = $this->movementEngine->interpret(
            $hasPrevious ? [
                'latitude' => (float) $session->last_latitude,
                'longitude' => (float) $session->last_longitude,
                'recorded_at' => $cursor?->toIso8601String(),
                'speed_mps' => null,
            ] : null,
            [
                'latitude' => $lat,
                'longitude' => $lng,
                'speed_mps' => $speed,
                'recorded_at' => $recordedAt->toIso8601String(),
            ],
        );
        $state = $interpreted['movement_state'];

        // Time: credit the interval since the last applied sample (gated ones
        // included), capped so offline gaps are not counted as activity.
        $intervalSeconds = 0;
        if ($cursor !== null) {
            $maxInterval = max(60, (int) config('field_activity.max_active_interval_seconds', 900));
            $intervalSeconds = (int) min($maxInterval, max(0, $cursor->diffInSeconds($recordedAt)));
        }

        // Distance: measured from the last credited position (the anchor), so
        // GPS jitter while standing still adds nothing and slow movement made
        // of many short steps is not lost. Nothing is added while stopped or
        // for moves within the fix's accuracy / the stop radius.
        $credited = 0.0;
        $anchorLat = $session->distance_anchor_latitude ?? $session->last_persisted_latitude;
        $anchorLng = $session->distance_anchor_longitude ?? $session->last_persisted_longitude;
        if ($anchorLat === null || $anchorLng === null || $reanchor) {
            $anchorLat = $lat;
            $anchorLng = $lng;
        } else {
            $fromAnchor = GeoDistance::haversineMeters((float) $anchorLat, (float) $anchorLng, $lat, $lng);
            $threshold = max($accuracy ?? 0.0, (float) config('field_activity.stop_radius_meters', 50));
            // A device that reports speed 0 while clearly far away still moved.
            $moved = $state !== FieldMovementState::STOPPED || $fromAnchor >= 2 * $threshold;
            if ($moved && $fromAnchor >= $threshold) {
                $credited = $fromAnchor;
                $anchorLat = $lat;
                $anchorLng = $lng;
            }
        }

        $persist = $this->shouldPersist($session, $lat, $lng, $recordedAt, $state);
        if ($persist) {
            $this->createPoint($session, $user, $raw, $lat, $lng, $accuracy, $speed, $recordedAt, $credited, $state,
                $interpreted['heading_degrees'], $activeTaskSession);
        }

        $session->forceFill([
            'distance_meters' => (int) $session->distance_meters + (int) round($credited),
            'travel_seconds' => (int) $session->travel_seconds + ($state === FieldMovementState::STOPPED ? 0 : $intervalSeconds),
            'stationary_seconds' => (int) $session->stationary_seconds + ($state === FieldMovementState::STOPPED ? $intervalSeconds : 0),
            'last_latitude' => $lat,
            'last_longitude' => $lng,
            'last_accuracy_meters' => $accuracy,
            'last_recorded_at' => $recordedAt,
            'last_movement_state' => $state,
            'distance_anchor_latitude' => (float) $anchorLat,
            'distance_anchor_longitude' => (float) $anchorLng,
        ]);
        if ($persist) {
            $session->forceFill([
                'last_persisted_latitude' => $lat,
                'last_persisted_longitude' => $lng,
                'last_persisted_recorded_at' => $recordedAt,
            ]);
        }

        return [
            'status' => $persist ? 'persisted' : 'gated',
            'raw' => [
                'latitude' => $lat,
                'longitude' => $lng,
                'accuracy_meters' => $accuracy,
                'speed_mps' => $speed,
                'heading_degrees' => isset($raw['heading_degrees']) ? (float) $raw['heading_degrees'] : $interpreted['heading_degrees'],
                'recorded_at' => $recordedAt->toIso8601String(),
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $raw
     */
    private function createPoint(
        FieldActivitySession $session,
        User $user,
        array $raw,
        float $lat,
        float $lng,
        ?float $accuracy,
        ?float $speed,
        Carbon $recordedAt,
        float $distance,
        FieldMovementState $state,
        ?float $heading,
        ?TaskTrackingSession $activeTaskSession,
    ): FieldLocationPoint {
        // Only trust task links that belong to this user's open task session;
        // client-sent ids are otherwise ignored.
        $taskId = $activeTaskSession?->task_id;
        $taskSessionId = $activeTaskSession?->id;
        if (isset($raw['task_tracking_session_id']) && $activeTaskSession !== null
            && (int) $raw['task_tracking_session_id'] !== (int) $activeTaskSession->id) {
            $taskId = null;
            $taskSessionId = null;
        }
        $clientPointId = isset($raw['client_point_id']) && is_string($raw['client_point_id'])
            ? substr($raw['client_point_id'], 0, 36)
            : null;

        return FieldLocationPoint::query()->create([
            'field_activity_session_id' => $session->id,
            'company_id' => $session->company_id,
            'user_id' => $user->id,
            'client_point_id' => $clientPointId,
            'task_id' => $taskId,
            'task_tracking_session_id' => $taskSessionId,
            'latitude' => $lat,
            'longitude' => $lng,
            'accuracy_meters' => $accuracy,
            'speed_mps' => $speed,
            'heading_degrees' => isset($raw['heading_degrees']) ? (float) $raw['heading_degrees'] : $heading,
            'distance_from_previous_meters' => round($distance, 2),
            'movement_state' => $state,
            'recorded_at' => $recordedAt,
        ]);
    }

    private function shouldPersist(
        FieldActivitySession $session,
        float $lat,
        float $lng,
        Carbon $recordedAt,
        FieldMovementState $state,
    ): bool {
        if ($session->last_persisted_latitude === null || $session->last_persisted_longitude === null) {
            return true;
        }

        $minInterval = (int) config('field_activity.persist_min_interval_seconds', 30);
        $minDistance = (float) config('field_activity.persist_min_distance_meters', 20);

        // Always persist when entering/leaving stopped to help stop detection.
        if ($state === FieldMovementState::STOPPED
            || $session->last_movement_state === FieldMovementState::STOPPED) {
            $minInterval = min($minInterval, 15);
            $minDistance = min($minDistance, 10);
        }

        if ($session->last_persisted_recorded_at !== null
            && $session->last_persisted_recorded_at->diffInSeconds($recordedAt) < $minInterval) {
            $distance = GeoDistance::haversineMeters(
                (float) $session->last_persisted_latitude,
                (float) $session->last_persisted_longitude,
                $lat,
                $lng,
            );
            if ($distance < $minDistance) {
                return false;
            }
        }

        return true;
    }

    /**
     * @param  array<string, mixed>  $latest
     */
    private function upsertLiveSnapshot(FieldActivitySession $session, array $latest): void
    {
        try {
            $this->snapshotService->upsertFromTrackingEvent([
                'company_id' => $session->company_id,
                'user_id' => $session->user_id,
                'task_id' => null,
                'tracking_session_id' => null,
                'latitude' => $latest['latitude'],
                'longitude' => $latest['longitude'],
                'accuracy_meters' => $latest['accuracy_meters'],
                'speed_mps' => $latest['speed_mps'],
                'heading_degrees' => $latest['heading_degrees'],
                'event_type' => 'field_activity',
                'task_status' => null,
                'arrived' => false,
                'recorded_at' => $latest['recorded_at'],
            ]);
        } catch (Throwable $e) {
            Log::debug('field_activity.snapshot_failed', ['message' => $e->getMessage()]);
        }
    }

    /** "Still at this stop?" push for long pending stops (run after stop detection). */
    public function sendStopReminders(FieldActivitySession $session): void
    {
        $reminderAfter = (int) config('field_activity.stop_reminder_seconds', 1800);
        $open = FieldStop::query()
            ->where('field_activity_session_id', $session->id)
            ->whereNull('departed_at')
            ->where('classification', FieldStopClassification::PENDING)
            ->where('reminder_sent', false)
            ->get();

        foreach ($open as $stop) {
            $dwell = $stop->arrived_at->diffInSeconds(now());
            if ($dwell < $reminderAfter) {
                continue;
            }

            $this->notificationService->notifyUser((int) $session->user_id, [
                'company_id' => (int) $session->company_id,
                'type' => 'field_activity.stop_reminder',
                'category' => NotificationCategory::TRACKING->value,
                'title' => 'Still at this stop?',
                'message' => 'You have been stationary for a while. Classify this stop as Customer, Lead, Personal, or Ignore.',
                'reference_type' => FieldStop::class,
                'reference_id' => (int) $stop->id,
                'action_url' => '/agent/field-activity',
                'action_route' => 'field-activity.today',
                'priority' => NotificationPriority::NORMAL->value,
                'created_by_user_id' => null,
                'metadata' => [
                    'field_stop_id' => $stop->id,
                    'latitude' => $stop->latitude,
                    'longitude' => $stop->longitude,
                ],
                'dedupe_key' => 'field-stop-reminder:' . $stop->id,
            ]);

            $stop->update(['reminder_sent' => true]);
        }
    }

    private function notifyEndOfDayReview(FieldActivitySession $session, FieldDailySummary $summary): void
    {
        if ((int) $summary->unknown_stop_count <= 0) {
            return;
        }

        $this->notificationService->notifyUser((int) $session->user_id, [
            'company_id' => (int) $session->company_id,
            'type' => 'field_activity.daily_review',
            'category' => NotificationCategory::TRACKING->value,
            'title' => 'Review today’s field stops',
            'message' => sprintf(
                'You have %d unclassified stop(s). Classify them to update CRM.',
                (int) $summary->unknown_stop_count,
            ),
            'reference_type' => FieldDailySummary::class,
            'reference_id' => (int) $summary->id,
            'action_url' => '/agent/field-activity?inbox=1',
            'action_route' => 'field-activity.pending-review',
            'priority' => NotificationPriority::NORMAL->value,
            'created_by_user_id' => null,
            'metadata' => [
                'summary_date' => $summary->summary_date?->toDateString(),
                'unknown_stop_count' => $summary->unknown_stop_count,
            ],
            'dedupe_key' => 'field-daily-review:' . $summary->company_id . ':' . $summary->user_id . ':' . $summary->summary_date?->toDateString(),
        ]);
    }

    /**
     * The caller's own field activity for today (company time zone): every
     * trip of the day, not just the last one. Any member (agents and managers).
     *
     * @return array<string, mixed>
     */
    public function todayForAgent(User $user, ?int $companyId = null): array
    {
        $context = $this->attendanceAccessService->resolve($user, $companyId);
        $company = $context->company;

        $enabled = $this->settingService->isEnabledForCompany($company);
        [$dayStart, $dayEnd] = CompanyClock::dayBounds($company);
        $today = CompanyClock::today($company);

        $sessions = FieldActivitySession::query()
            ->where('company_id', $company->id)
            ->where('user_id', $user->id)
            ->where(function ($q) use ($dayStart, $dayEnd): void {
                $q->whereBetween('started_at', [$dayStart, $dayEnd])
                    // A trip started before midnight that is still running.
                    ->orWhere('status', FieldActivitySessionStatus::ACTIVE->value);
            })
            ->orderBy('started_at')
            ->orderBy('id')
            ->get();

        $session = $sessions->firstWhere(fn (FieldActivitySession $s): bool => $s->isActive()) ?? $sessions->last();

        $summary = FieldDailySummary::query()
            ->where('company_id', $company->id)
            ->where('user_id', $user->id)
            ->whereDate('summary_date', $today)
            ->first();

        $stops = $sessions->isEmpty()
            ? []
            : FieldStop::query()
                ->whereIn('field_activity_session_id', $sessions->pluck('id')->all())
                ->orderBy('arrived_at')
                ->get()
                ->map(fn (FieldStop $s): array => $this->serializeStop($s))
                ->all();

        return [
            'enabled' => $enabled,
            'date' => $today,
            'session' => $session ? $this->serializeSession($session) : null,
            'sessions' => $sessions->map(fn (FieldActivitySession $s): array => $this->serializeSession($s))->values()->all(),
            'summary' => $summary ? $this->serializeSummary($summary) : null,
            'stops' => $stops,
            'pending_review' => $this->pendingReviewSnapshot(
                (int) $company->id,
                (int) $user->id,
            ),
            'config' => [
                'moving_interval_seconds' => (int) config('field_activity.moving_interval_seconds', 60),
                'stationary_interval_seconds' => (int) config('field_activity.stationary_interval_seconds', 60),
                'stop_dwell_seconds' => $this->settingService->stopDwellSeconds($company),
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function pendingReviewForAgent(User $user, ?int $companyId = null): array
    {
        // Any member reviews their own stops (field trips are for managers too).
        $context = $this->attendanceAccessService->resolve($user, $companyId);

        return $this->pendingReviewSnapshot((int) $context->company->id, (int) $user->id);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function listStops(User $user, FieldActivitySession $session): array
    {
        $context = $this->attendanceAccessService->resolve($user, $session->company_id);

        if ((int) $session->user_id !== (int) $user->id
            || (int) $session->company_id !== (int) $context->company->id) {
            throw ValidationException::withMessages([
                'session' => ['Field activity session not found for this user.'],
            ]);
        }

        return FieldStop::query()
            ->where('field_activity_session_id', $session->id)
            ->orderBy('arrived_at')
            ->get()
            ->map(fn (FieldStop $s): array => $this->serializeStop($s))
            ->all();
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function classifyStop(User $user, FieldStop $stop, array $data): array
    {
        $context = $this->attendanceAccessService->resolve($user, $data['company_id'] ?? $stop->company_id);

        if ((int) $stop->user_id !== (int) $user->id
            || (int) $stop->company_id !== (int) $context->company->id) {
            throw ValidationException::withMessages([
                'stop' => ['Stop not found for this user.'],
            ]);
        }

        $classification = FieldStopClassification::tryFrom((string) ($data['classification'] ?? ''));
        if ($classification === null || $classification === FieldStopClassification::PENDING) {
            throw ValidationException::withMessages([
                'classification' => ['Provide a valid classification: customer_visit, lead_visit, org_visit, personal, or ignore.'],
            ]);
        }

        $leadId = isset($data['lead_id']) ? (int) $data['lead_id'] : $stop->lead_id;
        $locationId = isset($data['company_location_id']) ? (int) $data['company_location_id'] : $stop->company_location_id;

        if (in_array($classification, [
            FieldStopClassification::CUSTOMER_VISIT,
            FieldStopClassification::LEAD_VISIT,
        ], true) && $leadId === null) {
            throw ValidationException::withMessages([
                'lead_id' => ['A lead is required when classifying a customer or lead visit.'],
            ]);
        }

        if ($leadId !== null) {
            $lead = Lead::query()
                ->where('company_id', $stop->company_id)
                ->whereKey($leadId)
                ->first();
            if ($lead === null) {
                throw ValidationException::withMessages([
                    'lead_id' => ['Lead not found in this organization.'],
                ]);
            }
        }

        $by = (($data['source'] ?? '') === 'reminder')
            ? FieldStopClassifiedBy::REMINDER
            : FieldStopClassifiedBy::AGENT;

        $stop->update([
            'classification' => $classification,
            'classified_by' => $by,
            'classified_at' => now(),
            'lead_id' => $leadId,
            'company_location_id' => $locationId,
            'confidence' => 1.0,
            'meta' => array_merge($stop->meta ?? [], [
                'agent_note' => $data['note'] ?? null,
            ]),
        ]);

        $stop = $stop->fresh() ?? $stop;
        if ($stop->isVisit()) {
            $this->crmBridgeService->syncVisitFromStop($stop);
        }

        $session = FieldActivitySession::query()->find($stop->field_activity_session_id);
        if ($session !== null) {
            $this->refreshCounts($session);
            if (! $session->isActive()) {
                $this->dailySummaryService->buildForSession($session);
            }
            $this->realtimeService->publishStopUpdated($session, $stop);
        }

        return $this->serializeStop($stop->fresh() ?? $stop);
    }

    private function refreshCounts(FieldActivitySession $session): void
    {
        $stops = FieldStop::query()
            ->where('field_activity_session_id', $session->id)
            ->get();

        $session->update([
            'stop_count' => $stops->count(),
            'visit_count' => $stops->filter(static fn (FieldStop $s): bool => $s->isVisit())->count(),
            'unknown_stop_count' => $stops->filter(static fn (FieldStop $s): bool => $s->isPending())->count(),
        ]);
    }

    /**
     * First trail point of a session from a known position (field trip start).
     */
    public function seedInitialPoint(
        FieldActivitySession $session,
        float $lat,
        float $lng,
        ?float $accuracy,
        Carbon $recordedAt,
    ): bool {
        if (! GeoDistance::isValidCoordinate($lat, $lng)) {
            return false;
        }
        if (FieldLocationPoint::query()->where('field_activity_session_id', $session->id)->exists()) {
            return false;
        }

        FieldLocationPoint::query()->create([
            'field_activity_session_id' => $session->id,
            'company_id' => $session->company_id,
            'user_id' => $session->user_id,
            'latitude' => $lat,
            'longitude' => $lng,
            'accuracy_meters' => $accuracy,
            'speed_mps' => 0.0,
            'heading_degrees' => null,
            'distance_from_previous_meters' => 0.0,
            'movement_state' => FieldMovementState::STOPPED,
            'recorded_at' => $recordedAt,
        ]);

        $session->forceFill([
            'last_latitude' => $lat,
            'last_longitude' => $lng,
            'last_accuracy_meters' => $accuracy,
            'last_recorded_at' => $recordedAt,
            'last_received_at' => now(),
            'last_movement_state' => FieldMovementState::STOPPED,
            'last_persisted_latitude' => $lat,
            'last_persisted_longitude' => $lng,
            'last_persisted_recorded_at' => $recordedAt,
            'distance_anchor_latitude' => $lat,
            'distance_anchor_longitude' => $lng,
        ])->save();

        return true;
    }

    /**
     * @param  array<string, mixed>  $clockMeta
     */
    private function seedInitialPointFromClockIn(
        FieldActivitySession $session,
        AttendanceRecord $record,
        array $clockMeta,
    ): bool {
        if (! isset($clockMeta['clock_in_latitude'], $clockMeta['clock_in_longitude'])) {
            return false;
        }

        $lat = (float) $clockMeta['clock_in_latitude'];
        $lng = (float) $clockMeta['clock_in_longitude'];
        if (! GeoDistance::isValidCoordinate($lat, $lng)) {
            return false;
        }

        $recordedAt = $record->clock_in_at ?? $session->started_at ?? now();
        $existingPoint = FieldLocationPoint::query()
            ->where('field_activity_session_id', $session->id)
            ->exists();
        if ($existingPoint) {
            return false;
        }

        FieldLocationPoint::query()->create([
            'field_activity_session_id' => $session->id,
            'company_id' => $session->company_id,
            'user_id' => $session->user_id,
            'task_id' => null,
            'task_tracking_session_id' => null,
            'latitude' => $lat,
            'longitude' => $lng,
            'accuracy_meters' => isset($clockMeta['clock_in_accuracy_m']) ? (float) $clockMeta['clock_in_accuracy_m'] : null,
            'speed_mps' => 0.0,
            'heading_degrees' => null,
            'distance_from_previous_meters' => 0.0,
            'movement_state' => FieldMovementState::STOPPED,
            'recorded_at' => $recordedAt,
        ]);

        $session->forceFill([
            'last_latitude' => $lat,
            'last_longitude' => $lng,
            'last_accuracy_meters' => isset($clockMeta['clock_in_accuracy_m']) ? (float) $clockMeta['clock_in_accuracy_m'] : null,
            'last_recorded_at' => $recordedAt,
            'last_movement_state' => FieldMovementState::STOPPED,
            'last_persisted_latitude' => $lat,
            'last_persisted_longitude' => $lng,
            'last_persisted_recorded_at' => $recordedAt,
            'distance_anchor_latitude' => $lat,
            'distance_anchor_longitude' => $lng,
        ])->save();

        Log::debug('field_activity.lifecycle.seed_clock_in_point', [
            'session_id' => $session->id,
            'company_id' => $session->company_id,
            'user_id' => $session->user_id,
            'recorded_at' => $recordedAt->toIso8601String(),
        ]);

        return true;
    }

    /**
     * @return array<string, mixed>
     */
    private function pendingReviewSnapshot(int $companyId, int $userId): array
    {
        $days = max(7, min(90, (int) config('field_activity.retention_days', 90)));
        $fromDate = now()->subDays($days)->startOfDay();

        $pendingStops = FieldStop::query()
            ->where('company_id', $companyId)
            ->where('user_id', $userId)
            ->where('classification', FieldStopClassification::PENDING)
            ->where('arrived_at', '>=', $fromDate)
            ->whereHas('session', function ($q): void {
                $q->whereIn('status', [
                    FieldActivitySessionStatus::COMPLETED->value,
                    FieldActivitySessionStatus::AUTO_CLOSED->value,
                ]);
            })
            ->with('session')
            ->orderBy('arrived_at')
            ->limit(120)
            ->get();

        $grouped = $pendingStops
            ->groupBy('field_activity_session_id')
            ->map(function ($items, $sessionId): array {
                /** @var FieldStop $first */
                $first = $items->first();
                $session = $first->session;

                return [
                    'session_id' => (int) $sessionId,
                    'started_at' => $session?->started_at?->toIso8601String(),
                    'ended_at' => $session?->ended_at?->toIso8601String(),
                    'status' => $session?->status?->value,
                    'pending_stop_count' => $items->count(),
                    'stops' => $items
                        ->sortBy('arrived_at')
                        ->values()
                        ->map(fn (FieldStop $stop): array => $this->serializeStop($stop))
                        ->all(),
                ];
            })
            ->sortBy('started_at')
            ->values()
            ->all();

        $oldest = $pendingStops->sortBy('arrived_at')->first();

        return [
            'pending_stop_count' => $pendingStops->count(),
            'pending_session_count' => count($grouped),
            'oldest_pending_date' => $oldest?->arrived_at?->toDateString(),
            'sessions' => $grouped,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function serializeSession(FieldActivitySession $session): array
    {
        return [
            'id' => $session->id,
            'company_id' => $session->company_id,
            'user_id' => $session->user_id,
            'attendance_record_id' => $session->attendance_record_id,
            'source' => $session->source ?? FieldActivitySession::SOURCE_ATTENDANCE,
            'client_trip_id' => $session->client_trip_id,
            'status' => $session->status?->value ?? (string) $session->status,
            'started_at' => $session->started_at?->toIso8601String(),
            'ended_at' => $session->ended_at?->toIso8601String(),
            'end_reason' => $session->end_reason,
            'distance_meters' => (int) $session->distance_meters,
            'travel_seconds' => (int) $session->travel_seconds,
            'stationary_seconds' => (int) $session->stationary_seconds,
            'stop_count' => (int) $session->stop_count,
            'visit_count' => (int) $session->visit_count,
            'unknown_stop_count' => (int) $session->unknown_stop_count,
            'last_latitude' => $session->last_latitude,
            'last_longitude' => $session->last_longitude,
            'last_movement_state' => $session->last_movement_state?->value,
            'last_recorded_at' => $session->last_recorded_at?->toIso8601String(),
            'last_received_at' => $session->last_received_at?->toIso8601String(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function serializeStop(FieldStop $stop): array
    {
        return [
            'id' => $stop->id,
            'field_activity_session_id' => $stop->field_activity_session_id,
            'arrived_at' => $stop->arrived_at?->toIso8601String(),
            'departed_at' => $stop->departed_at?->toIso8601String(),
            'latitude' => $stop->latitude,
            'longitude' => $stop->longitude,
            'address' => $stop->address,
            'duration_seconds' => (int) $stop->duration_seconds,
            'confidence' => (float) $stop->confidence,
            'match_type' => $stop->match_type?->value,
            'classification' => $stop->classification?->value,
            'classified_by' => $stop->classified_by?->value,
            'classified_at' => $stop->classified_at?->toIso8601String(),
            'company_location_id' => $stop->company_location_id,
            'lead_id' => $stop->lead_id,
            'meeting_id' => $stop->meeting_id,
            'task_id' => $stop->task_id,
            'reminder_sent' => (bool) $stop->reminder_sent,
            'meta' => $stop->meta,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function serializeSummary(FieldDailySummary $summary): array
    {
        // Live totals across every session of the day (several field trips),
        // so an in-progress trip is reflected before its summary is rebuilt.
        [$dayStart, $dayEnd] = CompanyClock::dayBounds((int) $summary->company_id, $summary->summary_date?->toDateString());
        $day = FieldActivitySession::query()
            ->where('company_id', $summary->company_id)
            ->where('user_id', $summary->user_id)
            ->whereBetween('started_at', [$dayStart, $dayEnd])
            ->selectRaw('COUNT(*) as sessions, COALESCE(SUM(distance_meters),0) as distance_meters, COALESCE(SUM(travel_seconds),0) as travel_seconds, COALESCE(SUM(stationary_seconds),0) as stationary_seconds, COALESCE(SUM(stop_count),0) as stop_count, COALESCE(SUM(visit_count),0) as visit_count, COALESCE(SUM(unknown_stop_count),0) as unknown_stop_count')
            ->first();
        $hasDay = (int) ($day->sessions ?? 0) > 0;

        return [
            'id' => $summary->id,
            'summary_date' => $summary->summary_date?->toDateString(),
            'distance_meters' => (int) ($hasDay ? $day->distance_meters : $summary->distance_meters),
            'travel_seconds' => (int) ($hasDay ? $day->travel_seconds : $summary->travel_seconds),
            'stationary_seconds' => (int) ($hasDay ? $day->stationary_seconds : $summary->stationary_seconds),
            'stop_count' => (int) ($hasDay ? $day->stop_count : $summary->stop_count),
            'visit_count' => (int) ($hasDay ? $day->visit_count : $summary->visit_count),
            'unknown_stop_count' => (int) ($hasDay ? $day->unknown_stop_count : $summary->unknown_stop_count),
            'personal_stop_count' => (int) $summary->personal_stop_count,
            'ignored_stop_count' => (int) $summary->ignored_stop_count,
            'narrative' => $summary->narrative,
            'metrics' => $summary->metrics,
            'generated_at' => $summary->generated_at?->toIso8601String(),
        ];
    }
}
