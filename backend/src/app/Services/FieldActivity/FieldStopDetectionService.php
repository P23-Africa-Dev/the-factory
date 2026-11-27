<?php

declare(strict_types=1);

namespace App\Services\FieldActivity;

use App\Enums\FieldStopClassification;
use App\Enums\FieldStopMatchType;
use App\Models\FieldActivitySession;
use App\Models\FieldLocationPoint;
use App\Jobs\SendStopDetectedNotificationJob;
use App\Models\FieldStop;
use App\Support\GeoDistance;
use Carbon\Carbon;
use Illuminate\Support\Collection;

class FieldStopDetectionService
{
    public function __construct(
        private readonly FieldLocationIntelligenceService $intelligenceService,
        private readonly FieldActivityRealtimeService $realtimeService,
        private readonly FieldDailySummaryService $dailySummaryService,
        private readonly FieldActivitySettingService $settingService,
    ) {}

    /** Company setting (default 5 min); falls back to config when the company is unknown. */
    private function dwellSecondsFor(FieldActivitySession $session): int
    {
        return $this->settingService->stopDwellSeconds($session->company);
    }

    /**
     * Detect stops from the session trail.
     *
     * A stop is the company's dwell time (default five minutes) in the same place (within stop_radius_meters),
     * regardless of GPS "slow" vs "stopped" labels. Instantaneous phone speed
     * is too noisy to reset a dwell cluster.
     *
     * Scans persisted points from the session's scan cursor (the start of the
     * dwell cluster still being built, or the last point already checked), so
     * every ingest does not rescan the whole trail. Live POSTs are typically
     * 1-2 points; clustering only the batch could never accumulate a dwell.
     *
     * Enrichment (reverse geocode, places, CRM matching) is NOT done here: the
     * caller passes the returned stop ids to enrichStops() (queued).
     * Callers hold a lock on the session row while this runs.
     *
     * @param  Collection<int, FieldLocationPoint>|null  $newPoints  Unused; kept for call-site compatibility.
     * @return list<int>  ids of stops created or closed
     */
    public function processSession(FieldActivitySession $session, ?Collection $newPoints = null): array
    {
        unset($newPoints);

        $points = $this->pointsForDetection($session);
        if ($points->isEmpty()) {
            return [];
        }

        $openStop = FieldStop::query()
            ->where('field_activity_session_id', $session->id)
            ->whereNull('departed_at')
            ->orderByDesc('arrived_at')
            ->first();

        $radius = (float) config('field_activity.stop_radius_meters', 50);
        $dwellSeconds = $this->dwellSecondsFor($session);
        $maxGapSeconds = (int) config('field_activity.stop_max_gap_seconds', 900);

        $cluster = [];
        $clusterStart = null;
        $clusterLastAt = null;
        $lastAt = null;
        $affected = [];

        foreach ($points as $point) {
            $lat = (float) $point->latitude;
            $lng = (float) $point->longitude;
            $recordedAt = $point->recorded_at instanceof Carbon
                ? $point->recorded_at->copy()
                : Carbon::parse((string) $point->recorded_at);
            $lastAt = $recordedAt;

            if ($openStop !== null) {
                $distanceFromOpen = GeoDistance::haversineMeters(
                    (float) $openStop->latitude,
                    (float) $openStop->longitude,
                    $lat,
                    $lng,
                );

                if ($distanceFromOpen <= $radius) {
                    continue;
                }

                $this->closeStop($openStop, $recordedAt, $session);
                $affected[] = (int) $openStop->id;
                $openStop = null;
            }

            if ($cluster !== [] && $clusterLastAt !== null) {
                $gap = $clusterLastAt->diffInSeconds($recordedAt);
                if ($gap > $maxGapSeconds) {
                    $cluster = [];
                    $clusterStart = null;
                    $clusterLastAt = null;
                }
            }

            if ($cluster === []) {
                $cluster[] = $point;
                $clusterStart = $recordedAt;
                $clusterLastAt = $recordedAt;
                continue;
            }

            $centroid = $this->centroid($cluster);
            $distanceFromCentroid = GeoDistance::haversineMeters(
                $centroid['latitude'],
                $centroid['longitude'],
                $lat,
                $lng,
            );

            if ($distanceFromCentroid > $radius) {
                $cluster = [$point];
                $clusterStart = $recordedAt;
                $clusterLastAt = $recordedAt;
                continue;
            }

            $cluster[] = $point;
            $clusterLastAt = $recordedAt;
            $dwell = $clusterStart !== null ? $clusterStart->diffInSeconds($recordedAt) : 0;

            if ($dwell >= $dwellSeconds && $openStop === null) {
                $openStop = $this->openStop($session, $cluster, $clusterStart, $recordedAt);
                $affected[] = (int) $openStop->id;
                $cluster = [];
                $clusterStart = null;
                $clusterLastAt = null;
            }
        }

        // Resume next time from the cluster still being built, or from the
        // last point checked (inside an open stop / nothing pending).
        $cursor = $clusterStart ?? $lastAt;
        if ($cursor !== null) {
            $session->forceFill(['stop_scan_cursor_at' => $cursor])->save();
        }

        if ($affected !== []) {
            $this->refreshSessionStopCounts($session);
        }

        return array_values(array_unique($affected));
    }

    /**
     * Finalize any open stop at session end (use last point / ended_at as departure).
     *
     * @return list<int>  ids of stops created or closed
     */
    public function finalizeOpenStops(FieldActivitySession $session, ?Carbon $endedAt = null): array
    {
        $affected = $this->processSession($session);

        $openStops = FieldStop::query()
            ->where('field_activity_session_id', $session->id)
            ->whereNull('departed_at')
            ->get();

        $departure = $endedAt ?? $session->ended_at ?? $session->last_recorded_at ?? now();

        foreach ($openStops as $stop) {
            $dwell = $stop->arrived_at->diffInSeconds($departure, false);
            $minDwell = $this->dwellSecondsFor($session);
            if ($dwell < $minDwell && ! $stop->hasUserRecord()) {
                $affected = array_values(array_diff($affected, [(int) $stop->id]));
                $stop->delete();
                continue;
            }
            $this->closeStop($stop, $departure, $session);
            $affected[] = (int) $stop->id;
        }

        $this->refreshSessionStopCounts($session);

        return array_values(array_unique($affected));
    }

    /** Rescan the whole trail next time (after stops were deleted or late points arrived). */
    public function resetScanCursor(FieldActivitySession $session): void
    {
        $session->forceFill(['stop_scan_cursor_at' => null])->save();
    }

    /**
     * Reverse geocode / match / auto-classify stops (network calls; run outside
     * the session lock, normally from a queued job). Publishes stop_updated.
     *
     * @param  list<int>  $stopIds
     */
    public function enrichStops(array $stopIds): void
    {
        if ($stopIds === []) {
            return;
        }

        $sessions = [];
        foreach (FieldStop::query()->whereIn('id', $stopIds)->get() as $stop) {
            try {
                $stop = $this->intelligenceService->enrichStop($stop);
            } catch (\Throwable $e) {
                report($e);
                continue;
            }
            $sessionId = (int) $stop->field_activity_session_id;
            $sessions[$sessionId] ??= FieldActivitySession::query()->find($sessionId);
            if ($sessions[$sessionId] !== null) {
                $this->realtimeService->publishStopUpdated($sessions[$sessionId], $stop->fresh() ?? $stop);
            }
        }

        // Auto-classification can turn a pending stop into a visit.
        foreach ($sessions as $session) {
            if ($session !== null) {
                $this->refreshSessionStopCounts($session);
            }
        }
    }

    /**
     * @return Collection<int, FieldLocationPoint>
     */
    private function pointsForDetection(FieldActivitySession $session): Collection
    {
        $since = $session->stop_scan_cursor_at;

        if ($since === null) {
            $openStop = FieldStop::query()
                ->where('field_activity_session_id', $session->id)
                ->whereNull('departed_at')
                ->orderByDesc('arrived_at')
                ->first();
            $lastClosed = $openStop === null
                ? FieldStop::query()
                    ->where('field_activity_session_id', $session->id)
                    ->whereNotNull('departed_at')
                    ->orderByDesc('departed_at')
                    ->first()
                : null;
            $since = $openStop?->arrived_at ?? $lastClosed?->departed_at;
        }

        return FieldLocationPoint::query()
            ->where('field_activity_session_id', $session->id)
            ->when($since !== null, static fn ($query) => $query->where('recorded_at', '>=', $since))
            ->orderBy('recorded_at')
            ->orderBy('id')
            ->get(['id', 'latitude', 'longitude', 'recorded_at']);
    }

    /**
     * @param  list<FieldLocationPoint>  $cluster
     */
    private function openStop(
        FieldActivitySession $session,
        array $cluster,
        Carbon $arrivedAt,
        Carbon $asOf,
    ): FieldStop {
        $centroid = $this->centroid($cluster);
        $duration = max(0, $arrivedAt->diffInSeconds($asOf));

        $stop = FieldStop::query()->create([
            'field_activity_session_id' => $session->id,
            'company_id' => $session->company_id,
            'user_id' => $session->user_id,
            'arrived_at' => $arrivedAt,
            'departed_at' => null,
            'latitude' => $centroid['latitude'],
            'longitude' => $centroid['longitude'],
            'address' => null,
            'duration_seconds' => $duration,
            'confidence' => 0,
            'match_type' => FieldStopMatchType::UNKNOWN,
            'classification' => FieldStopClassification::PENDING,
            'meta' => [
                'point_count' => count($cluster),
            ],
        ]);

        $this->realtimeService->publishStopCreated($session, $stop);

        // Late points after End found a stop on a trip that had none: its
        // report (auto-closed as "nothing to fill in") is due after all.
        if ($session->isFieldTrip() && ! $session->isActive()) {
            FieldActivitySession::query()
                ->whereKey($session->id)
                ->where('report_status', FieldActivitySession::REPORT_SUBMITTED)
                ->whereNull('report_submitted_at')
                ->update(['report_status' => FieldActivitySession::REPORT_DUE]);
        }

        // Ask the person what they are doing here (push; the app also shows a
        // card over the websocket). Shortly after, so the address is known.
        if ($session->isFieldTrip()) {
            SendStopDetectedNotificationJob::dispatch((int) $stop->id)
                ->delay(now()->addSeconds(20))
                ->afterCommit();
        }

        return $stop;
    }

    private function closeStop(FieldStop $stop, Carbon $departedAt, FieldActivitySession $session): void
    {
        $departure = $departedAt->lt($stop->arrived_at) ? $stop->arrived_at->copy() : $departedAt;
        $stop->update([
            'departed_at' => $departure,
            'duration_seconds' => (int) $stop->arrived_at->diffInSeconds($departure),
        ]);

        $this->realtimeService->publishStopUpdated($session, $stop);
    }

    /**
     * @param  list<FieldLocationPoint>  $cluster
     * @return array{latitude: float, longitude: float}
     */
    private function centroid(array $cluster): array
    {
        $latSum = 0.0;
        $lngSum = 0.0;
        $n = max(1, count($cluster));
        foreach ($cluster as $point) {
            $latSum += (float) $point->latitude;
            $lngSum += (float) $point->longitude;
        }

        return [
            'latitude' => $latSum / $n,
            'longitude' => $lngSum / $n,
        ];
    }

    private function refreshSessionStopCounts(FieldActivitySession $session): void
    {
        $stops = FieldStop::query()
            ->where('field_activity_session_id', $session->id)
            ->get();

        $visitCount = $stops->filter(static fn (FieldStop $s): bool => $s->isVisit())->count();
        $unknownCount = $stops->filter(static fn (FieldStop $s): bool => $s->isPending())->count();

        $session->update([
            'stop_count' => $stops->count(),
            'visit_count' => $visitCount,
            'unknown_stop_count' => $unknownCount,
        ]);

        try {
            $this->dailySummaryService->buildForSession($session->fresh() ?? $session, false);
        } catch (\Throwable) {
            // Counts on the session are already correct; summary is best-effort.
        }
    }
}
