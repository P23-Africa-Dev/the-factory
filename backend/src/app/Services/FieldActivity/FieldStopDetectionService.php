<?php

declare(strict_types=1);

namespace App\Services\FieldActivity;

use App\Enums\FieldStopClassification;
use App\Enums\FieldStopMatchType;
use App\Models\FieldActivitySession;
use App\Models\FieldLocationPoint;
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
    ) {}

    /**
     * Detect stops from the session trail.
     *
     * A stop is five minutes in the same place (within stop_radius_meters),
     * regardless of GPS "slow" vs "stopped" labels. Instantaneous phone speed
     * is too noisy to reset a dwell cluster.
     *
     * Always scans persisted points from the last closed stop (not just the
     * current ingest batch). Live POSTs are typically 1–2 points; clustering
     * only the batch can never accumulate a 5-minute dwell.
     *
     * @param  Collection<int, FieldLocationPoint>|null  $newPoints  Unused; kept for call-site compatibility.
     */
    public function processSession(FieldActivitySession $session, ?Collection $newPoints = null): void
    {
        unset($newPoints);

        $points = $this->pointsForDetection($session);
        if ($points->isEmpty()) {
            return;
        }

        $openStop = FieldStop::query()
            ->where('field_activity_session_id', $session->id)
            ->whereNull('departed_at')
            ->orderByDesc('arrived_at')
            ->first();

        $radius = (float) config('field_activity.stop_radius_meters', 50);
        $dwellSeconds = (int) config('field_activity.stop_dwell_seconds', 300);
        $maxGapSeconds = (int) config('field_activity.stop_max_gap_seconds', 900);

        $cluster = [];
        $clusterStart = null;
        $clusterLastAt = null;

        foreach ($points as $point) {
            $lat = (float) $point->latitude;
            $lng = (float) $point->longitude;
            $recordedAt = $point->recorded_at instanceof Carbon
                ? $point->recorded_at->copy()
                : Carbon::parse((string) $point->recorded_at);

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

                $this->closeStop($openStop, $recordedAt);
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
                $cluster = [];
                $clusterStart = null;
                $clusterLastAt = null;
            }
        }
    }

    /**
     * Finalize any open stop at session end (use last point / ended_at as departure).
     */
    public function finalizeOpenStops(FieldActivitySession $session, ?Carbon $endedAt = null): void
    {
        $this->processSession($session);

        $openStops = FieldStop::query()
            ->where('field_activity_session_id', $session->id)
            ->whereNull('departed_at')
            ->get();

        $departure = $endedAt ?? $session->ended_at ?? $session->last_recorded_at ?? now();

        foreach ($openStops as $stop) {
            $dwell = $stop->arrived_at->diffInSeconds($departure);
            $minDwell = (int) config('field_activity.stop_dwell_seconds', 300);
            if ($dwell < $minDwell) {
                $stop->delete();
                continue;
            }
            $this->closeStop($stop, $departure);
        }

        $this->refreshSessionStopCounts($session);
    }

    /**
     * @return Collection<int, FieldLocationPoint>
     */
    private function pointsForDetection(FieldActivitySession $session): Collection
    {
        $lastClosed = FieldStop::query()
            ->where('field_activity_session_id', $session->id)
            ->whereNotNull('departed_at')
            ->orderByDesc('departed_at')
            ->first();

        $openStop = FieldStop::query()
            ->where('field_activity_session_id', $session->id)
            ->whereNull('departed_at')
            ->orderByDesc('arrived_at')
            ->first();

        $since = null;
        if ($openStop?->arrived_at !== null) {
            $since = $openStop->arrived_at;
        } elseif ($lastClosed?->departed_at !== null) {
            $since = $lastClosed->departed_at;
        }

        return FieldLocationPoint::query()
            ->where('field_activity_session_id', $session->id)
            ->when($since !== null, static fn ($query) => $query->where('recorded_at', '>=', $since))
            ->orderBy('recorded_at')
            ->orderBy('id')
            ->get();
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

        $this->intelligenceService->enrichStop($stop);

        $this->refreshSessionStopCounts($session);

        $fresh = $stop->fresh() ?? $stop;
        $this->realtimeService->publishStopCreated($session, $fresh);

        return $fresh;
    }

    private function closeStop(FieldStop $stop, Carbon $departedAt): void
    {
        $duration = max(0, $stop->arrived_at->diffInSeconds($departedAt));
        $stop->update([
            'departed_at' => $departedAt,
            'duration_seconds' => $duration,
        ]);

        $this->intelligenceService->enrichStop($stop->fresh() ?? $stop);
        $this->refreshSessionStopCounts(
            FieldActivitySession::query()->findOrFail($stop->field_activity_session_id),
        );
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
