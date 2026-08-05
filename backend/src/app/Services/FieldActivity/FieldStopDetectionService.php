<?php

declare(strict_types=1);

namespace App\Services\FieldActivity;

use App\Enums\FieldMovementState;
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
    ) {}

    /**
     * Process recently persisted points and open/close stops for a session.
     *
     * @param  Collection<int, FieldLocationPoint>|null  $newPoints
     */
    public function processSession(FieldActivitySession $session, ?Collection $newPoints = null): void
    {
        $points = $newPoints;
        if ($points === null || $points->isEmpty()) {
            $points = FieldLocationPoint::query()
                ->where('field_activity_session_id', $session->id)
                ->orderBy('recorded_at')
                ->orderBy('id')
                ->get();
        }

        if ($points->isEmpty()) {
            return;
        }

        $openStop = FieldStop::query()
            ->where('field_activity_session_id', $session->id)
            ->whereNull('departed_at')
            ->orderByDesc('arrived_at')
            ->first();

        $radius = (float) config('field_activity.stop_radius_meters', 50);
        $dwellSeconds = (int) config('field_activity.stop_dwell_seconds', 900);
        $stopMaxSpeedKmh = (float) config('field_activity.stop_max_speed_kmh', 1.0);

        $cluster = [];
        $clusterStart = null;

        foreach ($points as $point) {
            $lat = (float) $point->latitude;
            $lng = (float) $point->longitude;
            $recordedAt = $point->recorded_at instanceof Carbon
                ? $point->recorded_at
                : Carbon::parse((string) $point->recorded_at);

            $speedKmh = $point->speed_mps !== null ? ((float) $point->speed_mps * 3.6) : null;
            $isStationary = ($point->movement_state === FieldMovementState::STOPPED)
                || ($speedKmh !== null && $speedKmh < $stopMaxSpeedKmh);

            if ($openStop !== null) {
                $distanceFromOpen = GeoDistance::haversineMeters(
                    (float) $openStop->latitude,
                    (float) $openStop->longitude,
                    $lat,
                    $lng,
                );

                if ($isStationary && $distanceFromOpen <= $radius) {
                    continue;
                }

                // Agent left the open stop.
                $this->closeStop($openStop, $recordedAt);
                $openStop = null;
            }

            if (! $isStationary) {
                $cluster = [];
                $clusterStart = null;
                continue;
            }

            if ($cluster === []) {
                $cluster[] = $point;
                $clusterStart = $recordedAt;
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
                continue;
            }

            $cluster[] = $point;
            $dwell = $clusterStart !== null ? $clusterStart->diffInSeconds($recordedAt) : 0;

            if ($dwell >= $dwellSeconds && $openStop === null) {
                $openStop = $this->openStop($session, $cluster, $clusterStart, $recordedAt);
                $cluster = [];
                $clusterStart = null;
            }
        }
    }

    /**
     * Finalize any open stop at session end (use last point / ended_at as departure).
     */
    public function finalizeOpenStops(FieldActivitySession $session, ?Carbon $endedAt = null): void
    {
        $openStops = FieldStop::query()
            ->where('field_activity_session_id', $session->id)
            ->whereNull('departed_at')
            ->get();

        $departure = $endedAt ?? $session->ended_at ?? $session->last_recorded_at ?? now();

        foreach ($openStops as $stop) {
            // Only confirm if dwell already met; otherwise discard incomplete clusters.
            $dwell = $stop->arrived_at->diffInSeconds($departure);
            $minDwell = (int) config('field_activity.stop_dwell_seconds', 900);
            if ($dwell < $minDwell) {
                $stop->delete();
                continue;
            }
            $this->closeStop($stop, $departure);
        }

        $this->refreshSessionStopCounts($session);
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

        // Release 2 intelligence — safe no-op enrichment when disabled / low confidence.
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
    }
}
