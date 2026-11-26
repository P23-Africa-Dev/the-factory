<?php

declare(strict_types=1);

namespace App\Services\FieldActivity;

use App\Enums\FieldStopClassification;
use App\Enums\FieldStopClassifiedBy;
use App\Enums\FieldStopMatchType;
use App\Enums\NotificationPriority;
use App\Jobs\EnrichFieldStopsJob;
use App\Jobs\GenerateFieldTripSummaryJob;
use App\Models\CompanyLocation;
use App\Models\FieldActivitySession;
use App\Models\FieldLocationPoint;
use App\Models\FieldStop;
use App\Models\FieldStopAttachment;
use App\Models\Lead;
use App\Models\User;
use App\Services\Attendance\AttendanceAccessService;
use App\Support\GeoDistance;
use Carbon\Carbon;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Trip reports: what the person did at each stop of a field trip.
 *
 * Every stop gets a record (activity, outcome for visits, notes, follow-up
 * date), its place is confirmed or corrected (the detected position is kept
 * in original_*), missed stops can be added, photos and documents attached.
 * Submitting the report builds the AI trip summary and tells the managers.
 */
class FieldTripReportService
{
    public const MAX_ATTACHMENTS_PER_STOP = 10;
    /** A stop added by the person this far from the recorded route is flagged for managers. */
    public const OFF_ROUTE_METERS = 1000;

    private const VISITS = ['customer_visit', 'lead_visit', 'org_visit'];

    public function __construct(
        private readonly AttendanceAccessService $accessService,
        private readonly FieldActivitySessionService $sessionService,
        private readonly FieldCrmBridgeService $crmBridgeService,
        private readonly FieldActivityRealtimeService $realtimeService,
        private readonly FieldActivitySettingService $settingService,
        private readonly FieldActivityVisibility $visibility,
        private readonly FieldTripService $tripService,
    ) {}

    // ── Read ────────────────────────────────────────────────────────────────

    /**
     * @return array<string, mixed>
     */
    public function report(User $user, FieldActivitySession $trip, mixed $companyId = null): array
    {
        $this->assertOwnTrip($user, $trip, $companyId);

        return $this->payload($trip);
    }

    /**
     * Trips whose report is still due (home banner and the Start gate).
     *
     * @return array<string, mixed>
     */
    public function dueReports(User $user, mixed $companyId = null): array
    {
        $context = $this->accessService->resolve($user, is_numeric($companyId) ? (int) $companyId : null);
        $trips = FieldActivitySession::query()
            ->where('company_id', $context->company->id)
            ->where('user_id', $user->id)
            ->where('source', FieldActivitySession::SOURCE_FIELD_TRIP)
            ->where('report_status', FieldActivitySession::REPORT_DUE)
            ->orderByDesc('started_at')
            ->limit(20)
            ->get();

        $pending = FieldStop::query()
            ->whereIn('field_activity_session_id', $trips->pluck('id'))
            ->where('record_status', FieldStop::RECORD_PENDING)
            ->selectRaw('field_activity_session_id, COUNT(*) as c')
            ->groupBy('field_activity_session_id')
            ->pluck('c', 'field_activity_session_id');

        return [
            'policy' => $this->settingService->tripReportPolicy($context->company),
            'trips' => $trips->map(fn (FieldActivitySession $t): array => [
                'id' => $t->id,
                'started_at' => $t->started_at?->toIso8601String(),
                'ended_at' => $t->ended_at?->toIso8601String(),
                'stop_count' => (int) $t->stop_count,
                'pending_stop_count' => (int) ($pending[$t->id] ?? 0),
                'end_reason' => $t->end_reason,
            ])->values()->all(),
        ];
    }

    // ── Write: records ──────────────────────────────────────────────────────

    /**
     * Save what the person did at a stop (idempotent: saving again overwrites).
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function recordStop(User $user, FieldStop $stop, array $data): array
    {
        $trip = $this->ownTripOf($user, $stop, $data['company_id'] ?? null);

        DB::transaction(function () use ($stop, $data): void {
            /** @var FieldStop $locked */
            $locked = FieldStop::query()->lockForUpdate()->findOrFail($stop->id);
            $this->applyRecord($locked, $data);
        });

        return $this->afterStopChange($trip, $stop->fresh() ?? $stop, 'record');
    }

    /**
     * A stop the system missed, added by the person (idempotent on client_stop_id).
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function addManualStop(User $user, FieldActivitySession $trip, array $data): array
    {
        $this->assertOwnTrip($user, $trip, $data['company_id'] ?? null);

        $clientId = isset($data['client_stop_id']) ? (string) $data['client_stop_id'] : null;
        if ($clientId !== null) {
            $existing = FieldStop::query()
                ->where('field_activity_session_id', $trip->id)
                ->where('client_stop_id', $clientId)
                ->first();
            if ($existing !== null) {
                return $this->stopPayload($existing);
            }
        }

        $lat = (float) $data['latitude'];
        $lng = (float) $data['longitude'];
        if (! GeoDistance::isValidCoordinate($lat, $lng)) {
            throw ValidationException::withMessages(['latitude' => ['Choose a valid place.']]);
        }

        $arrived = Carbon::parse((string) $data['arrived_at']);
        $departed = Carbon::parse((string) $data['departed_at']);
        $tripStart = $trip->started_at ?? $arrived;
        $tripEnd = $trip->ended_at ?? now();
        $slack = 300;
        if ($departed->lte($arrived)) {
            throw ValidationException::withMessages(['departed_at' => ['The leaving time must be after the arrival time.']]);
        }
        if ($arrived->lt($tripStart->copy()->subSeconds($slack)) || $departed->gt($tripEnd->copy()->addSeconds($slack))) {
            throw ValidationException::withMessages(['arrived_at' => ['The stop must be within the trip ('.$tripStart->format('H:i').' – '.$tripEnd->format('H:i').').']]);
        }

        $offRoute = $this->distanceFromRoute($trip, $lat, $lng) > self::OFF_ROUTE_METERS;

        $stop = DB::transaction(function () use ($trip, $data, $lat, $lng, $arrived, $departed, $clientId, $offRoute): FieldStop {
            $stop = FieldStop::query()->create([
                'field_activity_session_id' => $trip->id,
                'company_id' => $trip->company_id,
                'user_id' => $trip->user_id,
                'source' => FieldStop::SOURCE_MANUAL,
                'client_stop_id' => $clientId,
                'arrived_at' => $arrived,
                'departed_at' => $departed,
                'latitude' => $lat,
                'longitude' => $lng,
                'address' => isset($data['address']) ? mb_substr((string) $data['address'], 0, 255) : null,
                'duration_seconds' => (int) $arrived->diffInSeconds($departed),
                'confidence' => 1.0,
                'match_type' => FieldStopMatchType::UNKNOWN,
                'classification' => FieldStopClassification::PENDING,
                'location_status' => FieldStop::LOCATION_CONFIRMED,
                'meta' => ['added_by_user' => true, 'off_route' => $offRoute],
            ]);
            if (! empty($data['activity'])) {
                $this->applyRecord($stop, $data + ['location' => ['action' => 'confirm']]);
            }

            return $stop;
        });

        if ($stop->address === null) {
            // Placed on the map without a name: look the address up like detected stops.
            EnrichFieldStopsJob::dispatch([(int) $stop->id])->afterCommit();
        }

        return $this->afterStopChange($trip, $stop->fresh() ?? $stop, 'add_stop');
    }

    /**
     * Remove a stop the person added by mistake (detected stops can't be deleted).
     *
     * @return array<string, mixed>
     */
    public function deleteManualStop(User $user, FieldStop $stop, mixed $companyId = null): array
    {
        $trip = $this->ownTripOf($user, $stop, $companyId);
        if ($stop->source !== FieldStop::SOURCE_MANUAL) {
            throw ValidationException::withMessages(['stop' => ['Only stops you added can be removed. Mark it as "Not a stop" instead.']]);
        }

        foreach ($stop->attachments as $attachment) {
            Storage::disk($attachment->disk)->delete($attachment->file_path);
        }
        $stop->delete();
        $this->sessionService->refreshCounts($trip);
        $this->markChanged($trip, 'remove_stop');

        return ['deleted' => true, 'completeness' => $this->completeness($trip)];
    }

    // ── Write: attachments ──────────────────────────────────────────────────

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function addAttachment(User $user, FieldStop $stop, UploadedFile $file, array $data): array
    {
        $trip = $this->ownTripOf($user, $stop, $data['company_id'] ?? null);

        $clientId = isset($data['client_attachment_id']) ? (string) $data['client_attachment_id'] : null;
        if ($clientId !== null) {
            $existing = FieldStopAttachment::query()
                ->where('field_stop_id', $stop->id)
                ->where('client_attachment_id', $clientId)
                ->first();
            if ($existing !== null) {
                return $this->attachmentPayload($existing);
            }
        }

        if (FieldStopAttachment::query()->where('field_stop_id', $stop->id)->count() >= self::MAX_ATTACHMENTS_PER_STOP) {
            throw ValidationException::withMessages(['file' => ['A stop can have up to '.self::MAX_ATTACHMENTS_PER_STOP.' attachments.']]);
        }

        $disk = (string) config('filesystems.drive_disk', 'drive');
        $path = Storage::disk($disk)->putFile(
            "field-stops/company-{$trip->company_id}/trip-{$trip->id}/stop-{$stop->id}",
            $file,
            ['visibility' => 'private'],
        );
        if ($path === false) {
            throw ValidationException::withMessages(['file' => ['The file could not be saved. Try again.']]);
        }

        $attachment = FieldStopAttachment::query()->create([
            'field_stop_id' => $stop->id,
            'company_id' => $trip->company_id,
            'user_id' => $user->id,
            'client_attachment_id' => $clientId,
            'disk' => $disk,
            'file_path' => $path,
            'mime_type' => $file->getMimeType() ?: $file->getClientMimeType(),
            'size_bytes' => (int) $file->getSize(),
            'original_name' => mb_substr((string) $file->getClientOriginalName(), 0, 255),
            'caption' => isset($data['caption']) ? mb_substr((string) $data['caption'], 0, 500) : null,
            'captured_at' => isset($data['captured_at']) ? Carbon::parse((string) $data['captured_at']) : now(),
            'latitude' => $data['latitude'] ?? null,
            'longitude' => $data['longitude'] ?? null,
        ]);
        $this->markChanged($trip, 'attachment');

        return $this->attachmentPayload($attachment);
    }

    /** The owner, or a manager allowed to see this person's trips (same rule as journeys). */
    public function streamAttachment(User $user, FieldStopAttachment $attachment, mixed $companyId = null): StreamedResponse
    {
        $context = $this->accessService->resolve($user, is_numeric($companyId) ? (int) $companyId : (int) $attachment->company_id);
        $allowed = (int) $attachment->company_id === (int) $context->company->id
            && ((int) $attachment->stop?->user_id === (int) $user->id
                || ($context->canManageAttendance()
                    && $this->visibility->canView($user, (int) $context->company->id, (string) $context->role, (int) $attachment->stop?->user_id)));
        if (! $allowed) {
            abort(404, 'Attachment not found.');
        }

        $disk = Storage::disk($attachment->disk);
        if (! $disk->exists($attachment->file_path)) {
            abort(404, 'This file is no longer available.');
        }

        return $disk->response($attachment->file_path, $attachment->original_name ?: basename($attachment->file_path), [
            'Content-Type' => $attachment->mime_type ?: 'application/octet-stream',
            'Cache-Control' => 'private, max-age=3600',
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    public function deleteAttachment(User $user, FieldStopAttachment $attachment, mixed $companyId = null): array
    {
        $stop = $attachment->stop;
        if ($stop === null) {
            abort(404);
        }
        $trip = $this->ownTripOf($user, $stop, $companyId);
        Storage::disk($attachment->disk)->delete($attachment->file_path);
        $attachment->delete();
        $this->markChanged($trip, 'attachment_removed');

        return ['deleted' => true];
    }

    // ── Submit ──────────────────────────────────────────────────────────────

    /**
     * @return array<string, mixed>
     */
    public function submit(User $user, FieldActivitySession $trip, mixed $companyId = null): array
    {
        $this->assertOwnTrip($user, $trip, $companyId);
        if ($trip->isActive()) {
            throw ValidationException::withMessages(['trip' => ['End the field trip before submitting its report.']]);
        }

        $completeness = $this->completeness($trip);
        if ($completeness['pending'] > 0) {
            throw ValidationException::withMessages([
                'stops' => [$completeness['pending'] === 1 ? '1 stop still needs details.' : $completeness['pending'].' stops still need details.'],
            ]);
        }

        $firstSubmit = $trip->report_status !== FieldActivitySession::REPORT_SUBMITTED;
        $trip->forceFill([
            'report_status' => FieldActivitySession::REPORT_SUBMITTED,
            'report_submitted_at' => $trip->report_submitted_at ?? now(),
        ])->save();

        GenerateFieldTripSummaryJob::dispatch((int) $trip->id);

        if ($firstSubmit) {
            $name = $user->name ?: 'A team member';
            $this->tripService->notifyManagersAbout(
                $trip,
                'field_trip.report_submitted',
                'Trip report submitted',
                sprintf('%s submitted the report for a field trip (%d %s).', $name, $completeness['total'], $completeness['total'] === 1 ? 'stop' : 'stops'),
                'field-trip-report-submitted:'.$trip->id,
                NotificationPriority::NORMAL,
                '/operations/journey_history/'.$trip->id,
            );
        }

        return $this->payload($trip->fresh() ?? $trip);
    }

    // ── Internals ───────────────────────────────────────────────────────────

    /**
     * @param  array<string, mixed>  $data
     */
    private function applyRecord(FieldStop $stop, array $data): void
    {
        $activity = FieldStopClassification::tryFrom((string) ($data['activity'] ?? ''));
        if ($activity === null || $activity === FieldStopClassification::PENDING) {
            throw ValidationException::withMessages(['activity' => ['Choose what you did at this stop.']]);
        }

        $leadId = array_key_exists('lead_id', $data) ? ($data['lead_id'] !== null ? (int) $data['lead_id'] : null) : $stop->lead_id;
        $locationId = array_key_exists('company_location_id', $data)
            ? ($data['company_location_id'] !== null ? (int) $data['company_location_id'] : null)
            : $stop->company_location_id;

        if ($activity === FieldStopClassification::CUSTOMER_VISIT && $leadId === null) {
            throw ValidationException::withMessages(['lead_id' => ['Choose the customer you visited.']]);
        }
        if ($leadId !== null && ! Lead::query()->where('company_id', $stop->company_id)->whereKey($leadId)->exists()) {
            throw ValidationException::withMessages(['lead_id' => ['That customer or lead is not in your organization.']]);
        }
        if ($locationId !== null && ! CompanyLocation::query()->where('company_id', $stop->company_id)->whereKey($locationId)->exists()) {
            throw ValidationException::withMessages(['company_location_id' => ['That location is not in your organization.']]);
        }

        $isVisit = in_array($activity->value, self::VISITS, true);
        $outcome = $isVisit ? ($data['outcome'] ?? null) : null;
        if (in_array($activity->value, ['customer_visit', 'lead_visit'], true) && ! in_array($outcome, FieldStop::OUTCOMES, true)) {
            throw ValidationException::withMessages(['outcome' => ['Choose how the visit went.']]);
        }

        $fill = [
            'classification' => $activity,
            'classified_by' => FieldStopClassifiedBy::AGENT,
            'classified_at' => now(),
            'confidence' => 1.0,
            'lead_id' => $leadId,
            'company_location_id' => $locationId,
            'outcome' => $outcome,
            'notes' => isset($data['notes']) ? mb_substr(trim((string) $data['notes']), 0, 5000) : $stop->notes,
            'follow_up_at' => $outcome === 'follow_up' && ! empty($data['follow_up_at']) ? Carbon::parse((string) $data['follow_up_at'])->toDateString() : null,
            'record_status' => FieldStop::RECORD_RECORDED,
            'recorded_at' => $stop->recorded_at ?? now(),
            'recorded_via' => in_array($data['via'] ?? null, ['live', 'review', 'web'], true) ? $data['via'] : 'review',
        ];

        $location = is_array($data['location'] ?? null) ? $data['location'] : [];
        $action = $location['action'] ?? null;
        if ($action === 'correct') {
            $lat = (float) ($location['latitude'] ?? 0);
            $lng = (float) ($location['longitude'] ?? 0);
            if (! GeoDistance::isValidCoordinate($lat, $lng)) {
                throw ValidationException::withMessages(['location.latitude' => ['Choose a valid place.']]);
            }
            // Keep what was detected, once, for the audit trail.
            if ($stop->original_latitude === null) {
                $fill['original_latitude'] = $stop->latitude;
                $fill['original_longitude'] = $stop->longitude;
                $fill['original_address'] = $stop->address !== null ? mb_substr((string) $stop->address, 0, 512) : null;
            }
            $fill['latitude'] = $lat;
            $fill['longitude'] = $lng;
            $fill['address'] = isset($location['address']) ? mb_substr((string) $location['address'], 0, 255) : $stop->address;
            $fill['location_status'] = FieldStop::LOCATION_CORRECTED;
        } elseif ($action === 'confirm' || $stop->location_status === FieldStop::LOCATION_UNCONFIRMED || $stop->location_status === null) {
            // Saving without changing the place confirms it (the quick, 2-tap path).
            if ($stop->location_status !== FieldStop::LOCATION_CORRECTED) {
                $fill['location_status'] = FieldStop::LOCATION_CONFIRMED;
            }
        }

        $stop->update($fill);
    }

    /**
     * Counts, CRM sync, live map, AI summary refresh after a stop changed.
     *
     * @return array<string, mixed>
     */
    private function afterStopChange(FieldActivitySession $trip, FieldStop $stop, string $change): array
    {
        if ($stop->isVisit()) {
            $this->crmBridgeService->syncVisitFromStop($stop);
        }
        $this->sessionService->refreshCounts($trip);
        $this->realtimeService->publishStopUpdated($trip, $stop);
        $this->markChanged($trip, $change);

        return $this->stopPayload($stop) + ['completeness' => $this->completeness($trip)];
    }

    /** After the report was submitted, edits are logged and the AI summary is refreshed. */
    private function markChanged(FieldActivitySession $trip, string $change): void
    {
        $trip->refresh();
        if ($trip->report_status !== FieldActivitySession::REPORT_SUBMITTED) {
            return;
        }
        $meta = is_array($trip->meta) ? $trip->meta : [];
        $log = is_array($meta['report_edits'] ?? null) ? $meta['report_edits'] : [];
        $log[] = ['at' => now()->toIso8601String(), 'change' => $change];
        $meta['report_edits'] = array_slice($log, -50);
        $trip->forceFill(['meta' => $meta])->save();
        // Debounced: one regeneration a minute after the last edit.
        GenerateFieldTripSummaryJob::dispatch((int) $trip->id)->delay(now()->addSeconds(60));
    }

    /**
     * @return array{total: int, recorded: int, pending: int, pending_ids: list<int>}
     */
    public function completeness(FieldActivitySession $trip): array
    {
        $stops = FieldStop::query()
            ->where('field_activity_session_id', $trip->id)
            ->get(['id', 'record_status']);
        $pending = $stops->where('record_status', '!=', FieldStop::RECORD_RECORDED)->pluck('id')->map(fn ($id): int => (int) $id)->values()->all();

        return [
            'total' => $stops->count(),
            'recorded' => $stops->count() - count($pending),
            'pending' => count($pending),
            'pending_ids' => $pending,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(FieldActivitySession $trip): array
    {
        $stops = FieldStop::query()
            ->with(['attachments', 'lead:id,name,company_name', 'companyLocation:id,name'])
            ->where('field_activity_session_id', $trip->id)
            ->orderBy('arrived_at')
            ->get();

        return [
            'trip' => $this->sessionService->serializeSession($trip) + [
                'report_status' => $trip->report_status,
                'report_submitted_at' => $trip->report_submitted_at?->toIso8601String(),
                'ai_summary' => $trip->ai_summary,
                'ai_summary_at' => $trip->ai_summary_at?->toIso8601String(),
            ],
            'stops' => $stops->map(fn (FieldStop $s): array => $this->stopPayload($s))->values()->all(),
            'completeness' => $this->completeness($trip),
            'policy' => $this->settingService->tripReportPolicy($trip->company),
            'limits' => ['max_attachments_per_stop' => self::MAX_ATTACHMENTS_PER_STOP, 'max_file_mb' => 10],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function stopPayload(FieldStop $stop): array
    {
        $stop->loadMissing(['attachments', 'lead:id,name,company_name', 'companyLocation:id,name']);

        return $this->sessionService->serializeStop($stop) + [
            'lead_name' => $stop->lead ? (string) ($stop->lead->company_name ?: $stop->lead->name) : null,
            'location_name' => $stop->companyLocation?->name,
            'added_by_user' => $stop->source === FieldStop::SOURCE_MANUAL,
            'off_route' => (bool) (($stop->meta ?? [])['off_route'] ?? false),
            'attachments' => $stop->attachments->map(fn (FieldStopAttachment $a): array => $this->attachmentPayload($a))->values()->all(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function attachmentPayload(FieldStopAttachment $a): array
    {
        return [
            'id' => $a->id,
            'client_attachment_id' => $a->client_attachment_id,
            'field_stop_id' => $a->field_stop_id,
            'mime_type' => $a->mime_type,
            'size_bytes' => (int) $a->size_bytes,
            'original_name' => $a->original_name,
            'caption' => $a->caption,
            'is_image' => $a->isImage(),
            'captured_at' => $a->captured_at?->toIso8601String(),
            'url' => '/field-trips/attachments/'.$a->id,
        ];
    }

    /** Shortest distance (m) from a place to the trip's recorded route (sampled). */
    private function distanceFromRoute(FieldActivitySession $trip, float $lat, float $lng): float
    {
        $best = INF;
        FieldLocationPoint::query()
            ->where('field_activity_session_id', $trip->id)
            ->orderBy('recorded_at')
            ->select(['id', 'latitude', 'longitude'])
            ->chunkById(2000, function ($points) use (&$best, $lat, $lng): void {
                foreach ($points as $p) {
                    $d = GeoDistance::haversineMeters($lat, $lng, (float) $p->latitude, (float) $p->longitude);
                    if ($d < $best) {
                        $best = $d;
                    }
                }
            });

        return is_finite($best) ? $best : 0.0;
    }

    private function assertOwnTrip(User $user, FieldActivitySession $trip, mixed $companyId): void
    {
        $context = $this->accessService->resolve($user, is_numeric($companyId) ? (int) $companyId : (int) $trip->company_id);
        if ((int) $trip->company_id !== (int) $context->company->id
            || (int) $trip->user_id !== (int) $user->id
            || ! $trip->isFieldTrip()) {
            throw ValidationException::withMessages(['trip' => ['Field trip not found.']]);
        }
    }

    private function ownTripOf(User $user, FieldStop $stop, mixed $companyId): FieldActivitySession
    {
        $trip = FieldActivitySession::query()->find($stop->field_activity_session_id);
        if ($trip === null || (int) $stop->user_id !== (int) $user->id) {
            throw ValidationException::withMessages(['stop' => ['Stop not found.']]);
        }
        $this->assertOwnTrip($user, $trip, $companyId);

        return $trip;
    }
}
