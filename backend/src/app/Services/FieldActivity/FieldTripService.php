<?php

declare(strict_types=1);

namespace App\Services\FieldActivity;

use App\Enums\FieldActivitySessionStatus;
use App\Enums\FieldMovementState;
use App\Enums\NotificationCategory;
use App\Enums\NotificationPriority;
use App\Models\Company;
use App\Models\FieldActivitySession;
use App\Models\FieldStop;
use App\Models\User;
use App\Services\Attendance\AttendanceAccessService;
use App\Services\Notification\NotificationService;
use App\Support\ClientTime;
use App\Support\GeoDistance;
use Carbon\Carbon;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Field Trips: tracking started on demand with "Start Field Trip" and ended with
 * "End Field Trip". Independent of clock-in and of the work day; any number per
 * day; available to agents and managers. One trip may be active per user.
 *
 * A trip is a FieldActivitySession with source = field_trip, so routes, stop
 * detection, live map and Journey History are shared with the existing engine.
 */
class FieldTripService
{
    /** No point for this long → one "we lost your location" push. */
    public const SIGNAL_LOST_AFTER_SECONDS = 600;

    public function __construct(
        private readonly AttendanceAccessService $accessService,
        private readonly FieldActivitySettingService $settingService,
        private readonly FieldActivitySessionService $sessionService,
        private readonly FieldActivityRealtimeService $realtimeService,
        private readonly NotificationService $notificationService,
    ) {}

    /**
     * @param  array<string, mixed>  $data  client_trip_id, latitude, longitude, accuracy_meters, recorded_at, company_id
     * @return array<string, mixed>
     */
    public function start(User $user, array $data): array
    {
        $company = $this->resolveEnabledCompany($user, $data['company_id'] ?? null);
        $clientTripId = isset($data['client_trip_id']) ? (string) $data['client_trip_id'] : null;

        // Idempotent replay (offline queue / double tap).
        if ($clientTripId !== null) {
            $replayed = FieldActivitySession::query()
                ->where('company_id', $company->id)
                ->where('client_trip_id', $clientTripId)
                ->first();
            if ($replayed !== null) {
                if ((int) $replayed->user_id !== (int) $user->id) {
                    throw ValidationException::withMessages(['client_trip_id' => ['This trip id is already in use.']]);
                }

                return $this->payload($replayed, created: false);
            }
        }

        $active = $this->activeFor((int) $company->id, (int) $user->id);
        if ($active !== null) {
            // One trip at a time: return the running one instead of failing.
            return $this->payload($active, created: false);
        }

        $startedAt = ClientTime::parse($data['recorded_at'] ?? null);
        if ($startedAt->gt(now()->addSeconds(120))) {
            $startedAt = now();
        }
        // An offline start replayed later keeps its real start time, within reason.
        if ($startedAt->lt(now()->subDay())) {
            $startedAt = now();
        }

        $lat = isset($data['latitude']) ? (float) $data['latitude'] : null;
        $lng = isset($data['longitude']) ? (float) $data['longitude'] : null;
        $hasFix = $lat !== null && $lng !== null && GeoDistance::isValidCoordinate($lat, $lng);
        $accuracy = isset($data['accuracy_meters']) ? (float) $data['accuracy_meters'] : null;

        try {
            $session = DB::transaction(function () use ($company, $user, $clientTripId, $startedAt, $hasFix, $lat, $lng, $accuracy): FieldActivitySession {
                $session = FieldActivitySession::query()->create([
                    'company_id' => $company->id,
                    'user_id' => $user->id,
                    'attendance_record_id' => null,
                    'source' => FieldActivitySession::SOURCE_FIELD_TRIP,
                    'client_trip_id' => $clientTripId,
                    'status' => FieldActivitySessionStatus::ACTIVE,
                    'started_at' => $startedAt,
                    'last_latitude' => $hasFix ? $lat : null,
                    'last_longitude' => $hasFix ? $lng : null,
                    'last_accuracy_meters' => $hasFix ? $accuracy : null,
                    'last_recorded_at' => $startedAt,
                    'last_movement_state' => FieldMovementState::STOPPED,
                    'meta' => $hasFix ? ['start' => ['latitude' => $lat, 'longitude' => $lng]] : [],
                ]);

                if ($hasFix) {
                    $this->sessionService->seedInitialPoint($session, (float) $lat, (float) $lng, $accuracy, $startedAt);
                }

                return $session;
            });
        } catch (QueryException $e) {
            // Lost a race with a concurrent start (one-active-per-user index).
            $existing = $this->activeFor((int) $company->id, (int) $user->id);
            if ($existing !== null) {
                return $this->payload($existing, created: false);
            }
            throw $e;
        }

        $session = $session->fresh() ?? $session;
        $this->realtimeService->publishTripLifecycle($session, 'trip_started');

        Log::info('field_trip.started', [
            'session_id' => $session->id,
            'company_id' => $session->company_id,
            'user_id' => $session->user_id,
            'has_fix' => $hasFix,
        ]);

        return $this->payload($session, created: true);
    }

    /**
     * @param  array<string, mixed>  $data  latitude, longitude, accuracy_meters, recorded_at, company_id
     * @return array<string, mixed>
     */
    public function end(User $user, FieldActivitySession $trip, array $data): array
    {
        $this->assertOwnTrip($user, $trip, $data['company_id'] ?? null);

        if (! $trip->isActive()) {
            // Already ended (double tap, auto-end, offline replay): report it.
            return $this->payload($trip, created: false);
        }

        // A final position, if sent, becomes the last trail point.
        if (isset($data['latitude'], $data['longitude'])) {
            try {
                $this->sessionService->recordPoints($user, $trip, [
                    'company_id' => $trip->company_id,
                    'points' => [[
                        'latitude' => $data['latitude'],
                        'longitude' => $data['longitude'],
                        'accuracy_meters' => $data['accuracy_meters'] ?? null,
                        'recorded_at' => $data['recorded_at'] ?? null,
                    ]],
                ]);
            } catch (Throwable $e) {
                Log::debug('field_trip.end_point_skipped', ['session_id' => $trip->id, 'message' => $e->getMessage()]);
            }
            $trip = $trip->fresh() ?? $trip;
        }

        $endedAt = ClientTime::parse($data['recorded_at'] ?? null);
        if ($endedAt->gt(now()->addSeconds(120))) {
            $endedAt = now();
        }

        $meta = is_array($trip->meta) ? $trip->meta : [];
        if ($trip->last_latitude !== null && $trip->last_longitude !== null) {
            $meta['end'] = ['latitude' => (float) $trip->last_latitude, 'longitude' => (float) $trip->last_longitude];
            $trip->forceFill(['meta' => $meta])->save();
        }

        $this->sessionService->completeSession(
            $trip,
            $endedAt,
            autoClosed: false,
            withNarrative: false,
            endReason: FieldActivitySession::END_REASON_USER,
        );

        $trip = $trip->fresh() ?? $trip;
        $this->realtimeService->publishTripLifecycle($trip, 'trip_ended');

        return $this->payload($trip, created: false);
    }

    /**
     * @return array<string, mixed>
     */
    public function current(User $user, ?int $companyId = null): array
    {
        $context = $this->accessService->resolve($user, $companyId);
        $company = $context->company;
        $active = $this->activeFor((int) $company->id, (int) $user->id);

        $today = FieldActivitySession::query()
            ->where('company_id', $company->id)
            ->where('user_id', $user->id)
            ->where('source', FieldActivitySession::SOURCE_FIELD_TRIP)
            ->where('started_at', '>=', now()->startOfDay())
            ->selectRaw('COUNT(*) as trips, COALESCE(SUM(distance_meters),0) as distance_meters, COALESCE(SUM(stop_count),0) as stop_count')
            ->first();

        return [
            'enabled' => $this->settingService->isEnabledForCompany($company),
            'can_manage_settings' => $context->canManageAttendance(),
            'trip' => $active ? $this->serializeTrip($active) : null,
            'today' => [
                'trip_count' => (int) ($today->trips ?? 0),
                'distance_meters' => (int) ($today->distance_meters ?? 0),
                'stop_count' => (int) ($today->stop_count ?? 0),
            ],
            'settings' => [
                'stop_dwell_seconds' => $this->settingService->stopDwellSeconds($company),
                'trip_reminder_seconds' => $this->settingService->tripReminderSeconds($company),
                'trip_auto_end_seconds' => $this->settingService->tripAutoEndSeconds($company),
                'moving_interval_seconds' => (int) config('field_activity.moving_interval_seconds', 30),
                'stationary_interval_seconds' => (int) config('field_activity.stationary_interval_seconds', 60),
            ],
        ];
    }

    /**
     * Scheduler pass (every 5 minutes): long-trip reminders, signal-lost pushes and
     * auto-end after the company's no-location limit. Never tied to the work day.
     *
     * @return array{reminded: int, signal_lost: int, auto_ended: int}
     */
    public function monitor(?Carbon $now = null): array
    {
        $now ??= now();
        $result = ['reminded' => 0, 'signal_lost' => 0, 'auto_ended' => 0];

        FieldActivitySession::query()
            ->where('source', FieldActivitySession::SOURCE_FIELD_TRIP)
            ->where('status', FieldActivitySessionStatus::ACTIVE)
            ->with('company')
            ->orderBy('id')
            ->chunkById(200, function ($trips) use ($now, &$result): void {
                foreach ($trips as $trip) {
                    try {
                        $outcome = $this->monitorTrip($trip, $now);
                        if ($outcome !== null) {
                            $result[$outcome]++;
                        }
                    } catch (Throwable $e) {
                        report($e);
                    }
                }
            });

        return $result;
    }

    private function monitorTrip(FieldActivitySession $trip, Carbon $now): ?string
    {
        $company = $trip->company;
        $lastSignal = $trip->last_recorded_at ?? $trip->started_at ?? $now;
        $silentFor = $lastSignal->diffInSeconds($now, false);

        // (c) Auto-end after the company's no-location limit (default 2 h).
        if ($silentFor >= $this->settingService->tripAutoEndSeconds($company)) {
            $this->sessionService->completeSession(
                $trip,
                $lastSignal->copy(),
                autoClosed: true,
                withNarrative: false,
                endReason: FieldActivitySession::END_REASON_AUTO_NO_SIGNAL,
            );
            $trip = $trip->fresh() ?? $trip;
            $this->realtimeService->publishTripLifecycle($trip, 'trip_ended');
            $this->notify($trip, 'field_trip.auto_ended', 'Field trip ended',
                sprintf('We ended your field trip because we had no location for %s. It is saved in your Journey History.', $this->humanDuration($this->settingService->tripAutoEndSeconds($company))),
                'field-trip-auto-ended:'.$trip->id, NotificationPriority::NORMAL);

            return 'auto_ended';
        }

        // (b) Signal lost: one push per silence (cleared when points arrive again).
        if ($silentFor >= self::SIGNAL_LOST_AFTER_SECONDS
            && ($trip->signal_lost_notified_at === null || $trip->signal_lost_notified_at->lt($lastSignal))) {
            $trip->forceFill(['signal_lost_notified_at' => $now])->save();
            $this->notify($trip, 'field_trip.signal_lost', 'We lost your location',
                'Your field trip is still running but we have not received your location for a while. Open Factory23 to keep tracking.',
                'field-trip-signal-lost:'.$trip->id.':'.$lastSignal->getTimestamp(), NotificationPriority::HIGH);

            return 'signal_lost';
        }

        // (a) Long-trip reminder, repeating every N hours (default 5 h).
        $reminderEvery = $this->settingService->tripReminderSeconds($company);
        $since = $trip->last_reminded_at ?? $trip->started_at ?? $now;
        if ($since->diffInSeconds($now, false) >= $reminderEvery) {
            $trip->forceFill(['last_reminded_at' => $now])->save();
            $elapsed = ($trip->started_at ?? $now)->diffInSeconds($now);
            $this->notify($trip, 'field_trip.reminder', 'Still on your field trip?',
                sprintf('You have been on a field trip for %s. Tap to end it if you are done.', $this->humanDuration((int) $elapsed)),
                'field-trip-reminder:'.$trip->id.':'.$now->getTimestamp(), NotificationPriority::NORMAL);

            return 'reminded';
        }

        return null;
    }

    /**
     * @return array<string, mixed>
     */
    public function serializeTrip(FieldActivitySession $trip): array
    {
        $base = $this->sessionService->serializeSession($trip);
        $end = $trip->ended_at ?? now();

        return [
            ...$base,
            'elapsed_seconds' => $trip->started_at ? (int) $trip->started_at->diffInSeconds($end) : 0,
            'open_stop' => (bool) FieldStop::query()
                ->where('field_activity_session_id', $trip->id)
                ->whereNull('departed_at')
                ->exists(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(FieldActivitySession $trip, bool $created): array
    {
        return [
            'trip' => $this->serializeTrip($trip->fresh() ?? $trip),
            'created' => $created,
        ];
    }

    private function activeFor(int $companyId, int $userId): ?FieldActivitySession
    {
        return FieldActivitySession::query()
            ->where('company_id', $companyId)
            ->where('user_id', $userId)
            ->where('status', FieldActivitySessionStatus::ACTIVE)
            ->orderByDesc('id')
            ->first();
    }

    private function resolveEnabledCompany(User $user, mixed $companyId): Company
    {
        $context = $this->accessService->resolve($user, is_numeric($companyId) ? (int) $companyId : null);
        if (! $this->settingService->isEnabledForCompany($context->company)) {
            throw ValidationException::withMessages([
                'field_activity' => ['Field trips are turned off for your organization. Ask an owner or admin to enable Field Activity.'],
            ]);
        }

        return $context->company;
    }

    private function assertOwnTrip(User $user, FieldActivitySession $trip, mixed $companyId): void
    {
        $context = $this->accessService->resolve($user, is_numeric($companyId) ? (int) $companyId : (int) $trip->company_id);
        if ((int) $trip->company_id !== (int) $context->company->id || (int) $trip->user_id !== (int) $user->id) {
            throw ValidationException::withMessages(['trip' => ['Field trip not found.']]);
        }
    }

    private function notify(FieldActivitySession $trip, string $type, string $title, string $message, string $dedupeKey, NotificationPriority $priority): void
    {
        try {
            $this->notificationService->notifyUser((int) $trip->user_id, [
                'company_id' => (int) $trip->company_id,
                'type' => $type,
                'category' => NotificationCategory::TRACKING->value,
                'title' => $title,
                'message' => $message,
                'reference_type' => FieldActivitySession::class,
                'reference_id' => (int) $trip->id,
                'action_url' => '/?field_trip=1',
                'action_route' => 'field-trip.current',
                'priority' => $priority->value,
                'created_by_user_id' => null,
                'metadata' => ['field_activity_session_id' => (int) $trip->id],
                'dedupe_key' => $dedupeKey,
            ]);
        } catch (Throwable $e) {
            Log::warning('field_trip.notify_failed', ['session_id' => $trip->id, 'type' => $type, 'message' => $e->getMessage()]);
        }
    }

    private function humanDuration(int $seconds): string
    {
        $hours = intdiv($seconds, 3600);
        $minutes = intdiv($seconds % 3600, 60);
        if ($hours > 0 && $minutes > 0) {
            return "{$hours} h {$minutes} min";
        }

        return $hours > 0 ? ($hours === 1 ? '1 hour' : "{$hours} hours") : "{$minutes} min";
    }
}
