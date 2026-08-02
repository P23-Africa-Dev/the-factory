<?php

declare(strict_types=1);

namespace App\Services\FieldActivity;

use App\Enums\FieldActivitySessionStatus;
use App\Enums\FieldMovementState;
use App\Enums\FieldStopClassification;
use App\Enums\FieldStopClassifiedBy;
use App\Enums\NotificationCategory;
use App\Enums\NotificationPriority;
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
use App\Support\GeoDistance;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Redis;
use Illuminate\Validation\ValidationException;
use Throwable;

class FieldActivitySessionService
{
    public function __construct(
        private readonly AttendanceAccessService $attendanceAccessService,
        private readonly FieldActivitySettingService $settingService,
        private readonly FieldMovementEngine $movementEngine,
        private readonly FieldStopDetectionService $stopDetectionService,
        private readonly FieldDailySummaryService $dailySummaryService,
        private readonly FieldCrmBridgeService $crmBridgeService,
        private readonly AgentLocationSnapshotService $snapshotService,
        private readonly NotificationService $notificationService,
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

        // Close any stale active sessions for this user.
        $staleClosed = FieldActivitySession::query()
            ->where('company_id', $company->id)
            ->where('user_id', $record->user_id)
            ->where('status', FieldActivitySessionStatus::ACTIVE)
            ->update([
                'status' => FieldActivitySessionStatus::AUTO_CLOSED,
                'ended_at' => now(),
            ]);

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
            $session = FieldActivitySession::query()
                ->where('attendance_record_id', $record->id)
                ->orderByDesc('id')
                ->first();
        }

        if ($session === null) {
            Log::warning('field_activity.lifecycle.end_missing_session', [
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

    public function completeSession(
        FieldActivitySession $session,
        Carbon|string|null $endedAt = null,
        bool $autoClosed = false,
        bool $withNarrative = false,
    ): FieldDailySummary {
        $ended = $endedAt instanceof Carbon ? $endedAt : ($endedAt !== null ? Carbon::parse($endedAt) : now());

        $this->stopDetectionService->finalizeOpenStops($session, $ended);

        $session->update([
            'status' => $autoClosed
                ? FieldActivitySessionStatus::AUTO_CLOSED
                : FieldActivitySessionStatus::COMPLETED,
            'ended_at' => $ended,
        ]);

        $summary = $this->dailySummaryService->buildForSession($session->fresh() ?? $session, $withNarrative);

        $this->notifyEndOfDayReview($session->fresh() ?? $session, $summary);

        Log::info('field_activity.lifecycle.session_completed', [
            'session_id' => $session->id,
            'company_id' => $session->company_id,
            'user_id' => $session->user_id,
            'auto_closed' => $autoClosed,
            'ended_at' => $ended->toIso8601String(),
            'distance_meters' => (int) $summary->distance_meters,
            'stop_count' => (int) $summary->stop_count,
            'visit_count' => (int) $summary->visit_count,
            'unknown_stop_count' => (int) $summary->unknown_stop_count,
        ]);

        return $summary;
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function recordPoints(User $user, FieldActivitySession $session, array $data): array
    {
        $context = $this->attendanceAccessService->resolve($user, $data['company_id'] ?? $session->company_id);
        $this->attendanceAccessService->ensureAgent($context);

        if ((int) $session->company_id !== (int) $context->company->id
            || (int) $session->user_id !== (int) $user->id) {
            throw ValidationException::withMessages([
                'session' => ['Field activity session not found for this agent.'],
            ]);
        }

        if (! $this->settingService->isEnabledForCompany($context->company)) {
            throw ValidationException::withMessages([
                'field_activity' => ['Field Activity Intelligence is not enabled for this organization.'],
            ]);
        }

        if (! $session->isActive()) {
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
                'task_id' => $data['task_id'] ?? null,
                'task_tracking_session_id' => $data['task_tracking_session_id'] ?? null,
            ]];
        }

        $maxBatch = (int) config('field_activity.max_batch_points', 50);
        if (count($rawPoints) > $maxBatch) {
            throw ValidationException::withMessages([
                'points' => ["A maximum of {$maxBatch} points can be submitted per request."],
            ]);
        }

        usort($rawPoints, static function (array $a, array $b): int {
            return strcmp((string) ($a['recorded_at'] ?? ''), (string) ($b['recorded_at'] ?? ''));
        });

        $activeTaskSession = TaskTrackingSession::query()
            ->where('company_id', $session->company_id)
            ->where('started_by_user_id', $user->id)
            ->whereNull('end_recorded_at')
            ->orderByDesc('id')
            ->first();

        $persisted = collect();

        DB::transaction(function () use ($session, $user, $rawPoints, $activeTaskSession, &$persisted): void {
            $session = FieldActivitySession::query()->lockForUpdate()->findOrFail($session->id);

            foreach ($rawPoints as $raw) {
                $point = $this->persistPoint($session, $user, $raw, $activeTaskSession);
                if ($point !== null) {
                    $persisted->push($point);
                }
            }
        });

        $session = $session->fresh() ?? $session;

        if ($persisted->isNotEmpty()) {
            $this->stopDetectionService->processSession($session, $persisted);
            $last = $persisted->last();
            $this->upsertLiveSnapshot($session, $last);
            $this->publishRealtime($session, $last);
            $this->maybeSendStopReminder($session);
        }

        Log::debug('field_activity.lifecycle.points_ingested', [
            'session_id' => $session->id,
            'company_id' => $session->company_id,
            'user_id' => $session->user_id,
            'received_count' => count($rawPoints),
            'persisted_count' => $persisted->count(),
            'stop_count' => (int) $session->stop_count,
            'unknown_stop_count' => (int) $session->unknown_stop_count,
        ]);

        return [
            'session' => $this->serializeSession($session->fresh() ?? $session),
            'persisted_count' => $persisted->count(),
            'stops_created' => FieldStop::query()
                ->where('field_activity_session_id', $session->id)
                ->count(),
        ];
    }

    /**
     * @param  array<string, mixed>  $raw
     */
    private function persistPoint(
        FieldActivitySession $session,
        User $user,
        array $raw,
        ?TaskTrackingSession $activeTaskSession,
    ): ?FieldLocationPoint {
        if (! isset($raw['latitude'], $raw['longitude'])) {
            return null;
        }

        $lat = (float) $raw['latitude'];
        $lng = (float) $raw['longitude'];
        if (! GeoDistance::isValidCoordinate($lat, $lng)) {
            return null;
        }

        $recordedAt = isset($raw['recorded_at']) && $raw['recorded_at'] !== null
            ? Carbon::parse((string) $raw['recorded_at'])
            : now();

        $previous = null;
        if ($session->last_latitude !== null && $session->last_longitude !== null) {
            $previous = [
                'latitude' => (float) $session->last_latitude,
                'longitude' => (float) $session->last_longitude,
                'recorded_at' => $session->last_recorded_at?->toIso8601String(),
                'speed_mps' => null,
            ];
        }

        $interpreted = $this->movementEngine->interpret($previous, [
            'latitude' => $lat,
            'longitude' => $lng,
            'speed_mps' => $raw['speed_mps'] ?? null,
            'recorded_at' => $recordedAt->toIso8601String(),
        ]);

        if (! $this->shouldPersist($session, $lat, $lng, $recordedAt, $interpreted['movement_state'])) {
            // Still update last-known for live map even if we skip trail persistence.
            $session->forceFill([
                'last_latitude' => $lat,
                'last_longitude' => $lng,
                'last_accuracy_meters' => isset($raw['accuracy_meters']) ? (float) $raw['accuracy_meters'] : null,
                'last_recorded_at' => $recordedAt,
                'last_movement_state' => $interpreted['movement_state'],
            ])->save();

            return null;
        }

        $taskId = isset($raw['task_id']) ? (int) $raw['task_id'] : ($activeTaskSession?->task_id);
        $taskSessionId = isset($raw['task_tracking_session_id'])
            ? (int) $raw['task_tracking_session_id']
            : $activeTaskSession?->id;

        $point = FieldLocationPoint::query()->create([
            'field_activity_session_id' => $session->id,
            'company_id' => $session->company_id,
            'user_id' => $user->id,
            'task_id' => $taskId,
            'task_tracking_session_id' => $taskSessionId,
            'latitude' => $lat,
            'longitude' => $lng,
            'accuracy_meters' => isset($raw['accuracy_meters']) ? (float) $raw['accuracy_meters'] : null,
            'speed_mps' => isset($raw['speed_mps']) ? (float) $raw['speed_mps'] : null,
            'heading_degrees' => isset($raw['heading_degrees'])
                ? (float) $raw['heading_degrees']
                : $interpreted['heading_degrees'],
            'distance_from_previous_meters' => $interpreted['distance_meters'],
            'movement_state' => $interpreted['movement_state'],
            'recorded_at' => $recordedAt,
        ]);

        $intervalSeconds = 0;
        if ($session->last_recorded_at !== null) {
            $intervalSeconds = max(0, $session->last_recorded_at->diffInSeconds($recordedAt));
        }

        $travelAdd = 0;
        $stationaryAdd = 0;
        if ($interpreted['movement_state'] === FieldMovementState::STOPPED) {
            $stationaryAdd = $intervalSeconds;
        } else {
            $travelAdd = $intervalSeconds;
        }

        $session->forceFill([
            'distance_meters' => (int) $session->distance_meters + (int) round($interpreted['distance_meters']),
            'travel_seconds' => (int) $session->travel_seconds + $travelAdd,
            'stationary_seconds' => (int) $session->stationary_seconds + $stationaryAdd,
            'last_latitude' => $lat,
            'last_longitude' => $lng,
            'last_accuracy_meters' => isset($raw['accuracy_meters']) ? (float) $raw['accuracy_meters'] : null,
            'last_recorded_at' => $recordedAt,
            'last_movement_state' => $interpreted['movement_state'],
            'last_persisted_latitude' => $lat,
            'last_persisted_longitude' => $lng,
            'last_persisted_recorded_at' => $recordedAt,
        ])->save();

        return $point;
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

    private function upsertLiveSnapshot(FieldActivitySession $session, FieldLocationPoint $point): void
    {
        try {
            $this->snapshotService->upsertFromTrackingEvent([
                'company_id' => $session->company_id,
                'user_id' => $session->user_id,
                'task_id' => $point->task_id,
                'tracking_session_id' => $point->task_tracking_session_id,
                'latitude' => $point->latitude,
                'longitude' => $point->longitude,
                'accuracy_meters' => $point->accuracy_meters,
                'speed_mps' => $point->speed_mps,
                'heading_degrees' => $point->heading_degrees,
                'event_type' => 'field_activity',
                'task_status' => null,
                'arrived' => false,
                'recorded_at' => $point->recorded_at?->toIso8601String(),
            ]);
        } catch (Throwable $e) {
            Log::debug('field_activity.snapshot_failed', ['message' => $e->getMessage()]);
        }
    }

    private function publishRealtime(FieldActivitySession $session, FieldLocationPoint $point): void
    {
        try {
            $prefix = (string) config('field_activity.redis_channel_prefix', 'factory23.tracking');
            $payload = [
                'type' => 'field_activity.location',
                'channel' => "{$prefix}.company.{$session->company_id}",
                'payload' => [
                    'field_activity_session_id' => $session->id,
                    'user_id' => $session->user_id,
                    'company_id' => $session->company_id,
                    'latitude' => $point->latitude,
                    'longitude' => $point->longitude,
                    'movement_state' => $point->movement_state?->value,
                    'recorded_at' => $point->recorded_at?->toIso8601String(),
                ],
            ];
            Redis::connection('pubsub')->publish(
                "{$prefix}.company.{$session->company_id}",
                json_encode($payload, JSON_THROW_ON_ERROR),
            );
        } catch (Throwable $e) {
            Log::debug('field_activity.realtime_publish_failed', ['message' => $e->getMessage()]);
        }
    }

    private function maybeSendStopReminder(FieldActivitySession $session): void
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
            'action_url' => '/agent/field-activity',
            'action_route' => 'field-activity.today',
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
     * @return array<string, mixed>
     */
    public function todayForAgent(User $user, ?int $companyId = null): array
    {
        $context = $this->attendanceAccessService->resolve($user, $companyId);
        $this->attendanceAccessService->ensureAgent($context);

        $enabled = $this->settingService->isEnabledForCompany($context->company);
        $session = FieldActivitySession::query()
            ->where('company_id', $context->company->id)
            ->where('user_id', $user->id)
            ->whereDate('started_at', now()->toDateString())
            ->orderByDesc('id')
            ->first();

        $summary = FieldDailySummary::query()
            ->where('company_id', $context->company->id)
            ->where('user_id', $user->id)
            ->whereDate('summary_date', now()->toDateString())
            ->first();

        $stops = $session
            ? FieldStop::query()
                ->where('field_activity_session_id', $session->id)
                ->orderBy('arrived_at')
                ->get()
                ->map(fn (FieldStop $s): array => $this->serializeStop($s))
                ->all()
            : [];

        return [
            'enabled' => $enabled,
            'session' => $session ? $this->serializeSession($session) : null,
            'summary' => $summary ? $this->serializeSummary($summary) : null,
            'stops' => $stops,
            'pending_review' => $this->pendingReviewSnapshot(
                (int) $context->company->id,
                (int) $user->id,
            ),
            'config' => [
                'moving_interval_seconds' => (int) config('field_activity.moving_interval_seconds', 60),
                'stationary_interval_seconds' => (int) config('field_activity.stationary_interval_seconds', 300),
                'stop_dwell_seconds' => (int) config('field_activity.stop_dwell_seconds', 900),
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function pendingReviewForAgent(User $user, ?int $companyId = null): array
    {
        $context = $this->attendanceAccessService->resolve($user, $companyId);
        $this->attendanceAccessService->ensureAgent($context);

        return $this->pendingReviewSnapshot((int) $context->company->id, (int) $user->id);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function listStops(User $user, FieldActivitySession $session): array
    {
        $context = $this->attendanceAccessService->resolve($user, $session->company_id);
        $this->attendanceAccessService->ensureAgent($context);

        if ((int) $session->user_id !== (int) $user->id
            || (int) $session->company_id !== (int) $context->company->id) {
            throw ValidationException::withMessages([
                'session' => ['Field activity session not found for this agent.'],
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
        $this->attendanceAccessService->ensureAgent($context);

        if ((int) $stop->user_id !== (int) $user->id
            || (int) $stop->company_id !== (int) $context->company->id) {
            throw ValidationException::withMessages([
                'stop' => ['Stop not found for this agent.'],
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
            'status' => $session->status?->value ?? (string) $session->status,
            'started_at' => $session->started_at?->toIso8601String(),
            'ended_at' => $session->ended_at?->toIso8601String(),
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
        return [
            'id' => $summary->id,
            'summary_date' => $summary->summary_date?->toDateString(),
            'distance_meters' => (int) $summary->distance_meters,
            'travel_seconds' => (int) $summary->travel_seconds,
            'stationary_seconds' => (int) $summary->stationary_seconds,
            'stop_count' => (int) $summary->stop_count,
            'visit_count' => (int) $summary->visit_count,
            'unknown_stop_count' => (int) $summary->unknown_stop_count,
            'personal_stop_count' => (int) $summary->personal_stop_count,
            'ignored_stop_count' => (int) $summary->ignored_stop_count,
            'narrative' => $summary->narrative,
            'metrics' => $summary->metrics,
            'generated_at' => $summary->generated_at?->toIso8601String(),
        ];
    }
}
