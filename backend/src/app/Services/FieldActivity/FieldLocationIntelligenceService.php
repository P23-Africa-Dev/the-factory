<?php

declare(strict_types=1);

namespace App\Services\FieldActivity;

use App\Enums\FieldStopClassification;
use App\Enums\FieldStopClassifiedBy;
use App\Enums\FieldStopMatchType;
use App\Models\AgentTerritory;
use App\Models\CompanyLocation;
use App\Models\FieldStop;
use App\Models\Lead;
use App\Models\Meeting;
use App\Models\Task;
use App\Models\TaskTrackingSession;
use App\Services\Location\MapboxGeocodingService;
use App\Services\Places\PlaceSearchService;
use App\Support\GeoDistance;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;
use Throwable;

class FieldLocationIntelligenceService
{
    public function __construct(
        private readonly MapboxGeocodingService $mapboxGeocodingService,
        private readonly PlaceSearchService $placeSearchService,
        private readonly FieldCrmBridgeService $crmBridgeService,
    ) {}

    public function enrichStop(FieldStop $stop): FieldStop
    {
        if ($stop->address === null) {
            $this->attachReverseGeocode($stop);
        }

        // Skip re-matching if agent already classified.
        if ($stop->classified_by === FieldStopClassifiedBy::AGENT
            || $stop->classified_by === FieldStopClassifiedBy::REMINDER) {
            return $stop->fresh() ?? $stop;
        }

        $match = $this->resolveMatch($stop);
        if ($match === null) {
            return $stop->fresh() ?? $stop;
        }

        $minConfidence = (float) config('field_activity.auto_classify_min_confidence', 0.8);
        $updates = [
            'match_type' => $match['match_type'],
            'confidence' => $match['confidence'],
            'company_location_id' => $match['company_location_id'] ?? $stop->company_location_id,
            'lead_id' => $match['lead_id'] ?? $stop->lead_id,
            'meeting_id' => $match['meeting_id'] ?? $stop->meeting_id,
            'task_id' => $match['task_id'] ?? $stop->task_id,
            'address' => $match['address'] ?? $stop->address,
            'meta' => array_merge($stop->meta ?? [], $match['meta'] ?? []),
        ];

        if ($match['confidence'] >= $minConfidence && isset($match['classification'])) {
            $updates['classification'] = $match['classification'];
            $updates['classified_by'] = FieldStopClassifiedBy::AUTO;
            $updates['classified_at'] = now();
        }

        $stop->update($updates);
        $stop = $stop->fresh() ?? $stop;

        if ($stop->classified_by === FieldStopClassifiedBy::AUTO && $stop->isVisit()) {
            $this->crmBridgeService->syncVisitFromStop($stop);
        }

        return $stop;
    }

    /**
     * @return array{
     *   match_type: FieldStopMatchType,
     *   confidence: float,
     *   classification?: FieldStopClassification,
     *   company_location_id?: int|null,
     *   lead_id?: int|null,
     *   meeting_id?: int|null,
     *   task_id?: int|null,
     *   address?: string|null,
     *   meta?: array
     * }|null
     */
    public function resolveMatch(FieldStop $stop): ?array
    {
        $radius = (float) config('field_activity.match_radius_meters', 75);
        $lat = (float) $stop->latitude;
        $lng = (float) $stop->longitude;
        $companyId = (int) $stop->company_id;

        // 1–3: company locations (customer / lead / org)
        $locationMatch = $this->matchCompanyLocation($companyId, $lat, $lng, $radius);
        if ($locationMatch !== null) {
            return $locationMatch;
        }

        // Task destination near stop
        $taskMatch = $this->matchActiveTask($stop, $radius);
        if ($taskMatch !== null) {
            return $taskMatch;
        }

        // Meeting via linked lead location / window
        $meetingMatch = $this->matchMeeting($stop, $radius);
        if ($meetingMatch !== null) {
            return $meetingMatch;
        }

        // 4: territory coverage signal (does not auto-classify as visit)
        if ($this->isInsideAgentTerritory((int) $stop->user_id, $companyId, $lat, $lng)) {
            return [
                'match_type' => FieldStopMatchType::TERRITORY,
                'confidence' => 0.55,
                'meta' => ['territory_hit' => true],
            ];
        }

        // 5: Places POI / residential
        $poiMatch = $this->matchPoi($stop);
        if ($poiMatch !== null) {
            return $poiMatch;
        }

        return [
            'match_type' => FieldStopMatchType::UNKNOWN,
            'confidence' => 0.1,
        ];
    }

    private function attachReverseGeocode(FieldStop $stop): void
    {
        try {
            $company = $stop->company;
            $result = $this->mapboxGeocodingService->reverseGeocodeCoordinates(
                (float) $stop->latitude,
                (float) $stop->longitude,
                $company,
            );
            if (! empty($result['place_name'])) {
                $stop->update(['address' => (string) $result['place_name']]);
            }
        } catch (Throwable $e) {
            Log::debug('field_activity.reverse_geocode_failed', [
                'stop_id' => $stop->id,
                'message' => $e->getMessage(),
            ]);
        }
    }

    /**
     * @return array<string, mixed>|null
     */
    private function matchCompanyLocation(int $companyId, float $lat, float $lng, float $radius): ?array
    {
        $locations = CompanyLocation::query()
            ->where('company_id', $companyId)
            ->where('is_active', true)
            ->whereNotNull('latitude')
            ->whereNotNull('longitude')
            ->with('crmLead')
            ->get();

        $best = null;
        $bestDistance = PHP_FLOAT_MAX;

        foreach ($locations as $location) {
            $distance = GeoDistance::haversineMeters(
                $lat,
                $lng,
                (float) $location->latitude,
                (float) $location->longitude,
            );
            if ($distance > $radius || $distance >= $bestDistance) {
                continue;
            }
            $bestDistance = $distance;
            $best = $location;
        }

        if ($best === null) {
            return null;
        }

        $confidence = max(0.5, 1.0 - ($bestDistance / max($radius, 1.0)) * 0.4);
        $lead = $best->crmLead;

        if ($lead !== null && $this->isCustomerLikeLead($lead)) {
            return [
                'match_type' => FieldStopMatchType::CRM_CUSTOMER,
                'confidence' => $confidence,
                'classification' => FieldStopClassification::CUSTOMER_VISIT,
                'company_location_id' => $best->id,
                'lead_id' => $lead->id,
                'address' => $best->address ?: $best->name,
                'meta' => ['match_distance_meters' => round($bestDistance, 1)],
            ];
        }

        if ($lead !== null) {
            return [
                'match_type' => FieldStopMatchType::CRM_LEAD,
                'confidence' => $confidence,
                'classification' => FieldStopClassification::LEAD_VISIT,
                'company_location_id' => $best->id,
                'lead_id' => $lead->id,
                'address' => $best->address ?: $best->name,
                'meta' => ['match_distance_meters' => round($bestDistance, 1)],
            ];
        }

        return [
            'match_type' => FieldStopMatchType::ORG_LOCATION,
            'confidence' => $confidence,
            'classification' => FieldStopClassification::ORG_VISIT,
            'company_location_id' => $best->id,
            'address' => $best->address ?: $best->name,
            'meta' => ['match_distance_meters' => round($bestDistance, 1)],
        ];
    }

    private function isCustomerLikeLead(Lead $lead): bool
    {
        if ($lead->converted_at !== null) {
            return true;
        }

        $status = strtolower((string) $lead->status);

        return in_array($status, ['won', 'customer', 'converted', 'closed_won'], true);
    }

    /**
     * @return array<string, mixed>|null
     */
    private function matchActiveTask(FieldStop $stop, float $radius): ?array
    {
        $session = TaskTrackingSession::query()
            ->where('company_id', $stop->company_id)
            ->where('started_by_user_id', $stop->user_id)
            ->whereNull('end_recorded_at')
            ->whereNotNull('destination_latitude')
            ->whereNotNull('destination_longitude')
            ->orderByDesc('id')
            ->first();

        if ($session === null) {
            // Also check tasks with destinations visited today.
            $task = Task::query()
                ->where('company_id', $stop->company_id)
                ->whereNotNull('latitude')
                ->whereNotNull('longitude')
                ->whereHas('assignments', function ($q) use ($stop): void {
                    $q->where('assigned_agent_id', $stop->user_id)->where('is_current', true);
                })
                ->get()
                ->first(function (Task $task) use ($stop, $radius): bool {
                    return GeoDistance::haversineMeters(
                        (float) $stop->latitude,
                        (float) $stop->longitude,
                        (float) $task->latitude,
                        (float) $task->longitude,
                    ) <= $radius;
                });

            if ($task === null) {
                return null;
            }

            return [
                'match_type' => FieldStopMatchType::TASK,
                'confidence' => 0.85,
                'classification' => FieldStopClassification::ORG_VISIT,
                'task_id' => $task->id,
                'address' => $task->address_full ?: $task->location_text,
                'meta' => ['task_linked' => true],
            ];
        }

        $distance = GeoDistance::haversineMeters(
            (float) $stop->latitude,
            (float) $stop->longitude,
            (float) $session->destination_latitude,
            (float) $session->destination_longitude,
        );

        if ($distance > $radius) {
            return null;
        }

        return [
            'match_type' => FieldStopMatchType::TASK,
            'confidence' => max(0.7, 1.0 - ($distance / max($radius, 1)) * 0.3),
            'classification' => FieldStopClassification::ORG_VISIT,
            'task_id' => $session->task_id,
            'meta' => [
                'task_tracking_session_id' => $session->id,
                'match_distance_meters' => round($distance, 1),
            ],
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function matchMeeting(FieldStop $stop, float $radius): ?array
    {
        $arrivedAt = $stop->arrived_at instanceof Carbon
            ? $stop->arrived_at
            : Carbon::parse((string) $stop->arrived_at);

        $meetings = Meeting::query()
            ->where('company_id', $stop->company_id)
            ->where('start_at', '<=', $arrivedAt->copy()->addHour())
            ->where('end_at', '>=', $arrivedAt->copy()->subHour())
            ->whereHas('attendees', function ($q) use ($stop): void {
                $q->where('user_id', $stop->user_id);
            })
            ->with(['leads.companyLocation'])
            ->get();

        foreach ($meetings as $meeting) {
            foreach ($meeting->leads as $lead) {
                $location = $lead->companyLocation;
                if ($location === null || $location->latitude === null || $location->longitude === null) {
                    continue;
                }
                $distance = GeoDistance::haversineMeters(
                    (float) $stop->latitude,
                    (float) $stop->longitude,
                    (float) $location->latitude,
                    (float) $location->longitude,
                );
                if ($distance <= $radius) {
                    return [
                        'match_type' => FieldStopMatchType::MEETING,
                        'confidence' => 0.88,
                        'classification' => $this->isCustomerLikeLead($lead)
                            ? FieldStopClassification::CUSTOMER_VISIT
                            : FieldStopClassification::LEAD_VISIT,
                        'meeting_id' => $meeting->id,
                        'lead_id' => $lead->id,
                        'company_location_id' => $location->id,
                        'address' => $location->address ?: $meeting->location,
                        'meta' => [
                            'meeting_title' => $meeting->title,
                            'match_distance_meters' => round($distance, 1),
                        ],
                    ];
                }
            }
        }

        return null;
    }

    private function isInsideAgentTerritory(int $userId, int $companyId, float $lat, float $lng): bool
    {
        $territory = AgentTerritory::query()
            ->where('company_id', $companyId)
            ->where('user_id', $userId)
            ->first();

        if ($territory === null || ! is_array($territory->geojson)) {
            return false;
        }

        return $this->pointInGeoJson($lat, $lng, $territory->geojson);
    }

    /**
     * @param  array<string, mixed>  $geojson
     */
    private function pointInGeoJson(float $lat, float $lng, array $geojson): bool
    {
        $type = $geojson['type'] ?? null;
        $coordinates = $geojson['coordinates'] ?? null;
        if ($type === 'Feature' && isset($geojson['geometry']) && is_array($geojson['geometry'])) {
            return $this->pointInGeoJson($lat, $lng, $geojson['geometry']);
        }
        if ($type === 'FeatureCollection' && isset($geojson['features']) && is_array($geojson['features'])) {
            foreach ($geojson['features'] as $feature) {
                if (is_array($feature) && $this->pointInGeoJson($lat, $lng, $feature)) {
                    return true;
                }
            }

            return false;
        }
        if ($type !== 'Polygon' || ! is_array($coordinates) || $coordinates === []) {
            return false;
        }

        $ring = $coordinates[0] ?? null;
        if (! is_array($ring) || count($ring) < 3) {
            return false;
        }

        // Ray casting; GeoJSON is [lng, lat].
        $inside = false;
        $j = count($ring) - 1;
        for ($i = 0; $i < count($ring); $i++) {
            $xi = (float) ($ring[$i][0] ?? 0);
            $yi = (float) ($ring[$i][1] ?? 0);
            $xj = (float) ($ring[$j][0] ?? 0);
            $yj = (float) ($ring[$j][1] ?? 0);

            $intersect = (($yi > $lat) !== ($yj > $lat))
                && ($lng < ($xj - $xi) * ($lat - $yi) / max(($yj - $yi), 0.0000001) + $xi);
            if ($intersect) {
                $inside = ! $inside;
            }
            $j = $i;
        }

        return $inside;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function matchPoi(FieldStop $stop): ?array
    {
        try {
            $company = $stop->company;
            $user = $stop->user;
            if ($company === null || $user === null) {
                return null;
            }

            $outcome = $this->placeSearchService->nearby(
                lat: (float) $stop->latitude,
                lng: (float) $stop->longitude,
                radiusM: (int) config('field_activity.match_radius_meters', 75),
                categories: null,
                limit: 5,
                company: $company,
                user: $user,
                source: 'field_activity',
            );

            $items = $outcome->results;
            if ($items === []) {
                return null;
            }

            $first = $items[0];
            $name = method_exists($first, 'name') ? (string) $first->name : 'Nearby place';
            $categories = property_exists($first, 'categories') && is_array($first->categories)
                ? $first->categories
                : [];
            $isResidential = collect($categories)->contains(
                static fn ($t): bool => is_string($t) && str_contains(strtolower($t), 'residential'),
            );

            return [
                'match_type' => $isResidential ? FieldStopMatchType::RESIDENTIAL : FieldStopMatchType::POI,
                'confidence' => 0.45,
                'address' => $name !== '' ? $name : ($stop->address ?? 'Nearby place'),
                'meta' => [
                    'poi_name' => $name,
                    'poi_categories' => $categories,
                ],
            ];
        } catch (Throwable $e) {
            Log::debug('field_activity.poi_match_failed', [
                'stop_id' => $stop->id,
                'message' => $e->getMessage(),
            ]);

            return null;
        }
    }
}
