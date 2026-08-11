<?php

declare(strict_types=1);

namespace App\Services\FieldActivity;

use App\Enums\FieldStopClassification;
use App\Models\AttendanceRecord;
use App\Models\FieldActivitySession;
use App\Models\FieldDailySummary;
use App\Models\FieldLocationPoint;
use App\Models\FieldStop;
use App\Models\User;
use App\Services\Attendance\AttendanceAccessService;
use Carbon\Carbon;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

class FieldJourneyService
{
    private const MAX_ROUTE_POINTS = 800;

    public function __construct(
        private readonly AttendanceAccessService $attendanceAccessService,
        private readonly FieldActivitySessionService $sessionService,
    ) {}

    /**
     * @param  array<string, mixed>  $filters
     * @return array{items: list<array<string, mixed>>, summary: array<string, mixed>, pagination: array<string, mixed>}
     */
    public function listForAgent(User $actor, User $target, array $filters = []): array
    {
        $context = $this->attendanceAccessService->resolve($actor, isset($filters['company_id']) ? (int) $filters['company_id'] : null);
        $company = $context->company;

        if ($context->isAgent()) {
            if ((int) $actor->id !== (int) $target->id) {
                throw ValidationException::withMessages([
                    'authorization' => ['Agents can only view their own journey history.'],
                ]);
            }
        } else {
            $this->attendanceAccessService->ensureCanManage($context);
            $this->assertUserInCompany($target, (int) $company->id);

            if ($context->role === 'supervisor') {
                if ((int) $target->supervisor_user_id !== (int) $actor->id) {
                    throw ValidationException::withMessages([
                        'authorization' => ['Supervisors can only view journey history of agents assigned to them.'],
                    ]);
                }
            }
        }

        [$from, $to] = $this->resolveDateRange($filters);

        /** @var LengthAwarePaginator $paginator */
        $paginator = FieldActivitySession::query()
            ->where('company_id', $company->id)
            ->where('user_id', $target->id)
            ->whereBetween('started_at', [$from->copy()->startOfDay(), $to->copy()->endOfDay()])
            ->orderByDesc('started_at')
            ->paginate(max(1, min(60, (int) ($filters['per_page'] ?? 30))));

        $sessionIds = collect($paginator->items())->pluck('id')->all();
        $summaries = FieldDailySummary::query()
            ->whereIn('field_activity_session_id', $sessionIds)
            ->get()
            ->keyBy('field_activity_session_id');

        $attendanceByDate = AttendanceRecord::query()
            ->where('company_id', $company->id)
            ->where('user_id', $target->id)
            ->whereBetween('attendance_date', [$from->toDateString(), $to->toDateString()])
            ->get()
            ->keyBy(fn (AttendanceRecord $r): string => $r->attendance_date?->toDateString() ?? '');

        $items = collect($paginator->items())->map(function (FieldActivitySession $session) use ($summaries, $attendanceByDate): array {
            $date = $session->started_at?->toDateString() ?? '';
            $summary = $summaries->get($session->id);
            $attendance = $attendanceByDate->get($date);

            return $this->serializeJourneyCard($session, $summary, $attendance);
        })->values()->all();

        $aggregate = FieldActivitySession::query()
            ->where('company_id', $company->id)
            ->where('user_id', $target->id)
            ->whereBetween('started_at', [$from->copy()->startOfDay(), $to->copy()->endOfDay()])
            ->selectRaw('COUNT(*) as journey_count')
            ->selectRaw('COALESCE(SUM(distance_meters),0) as distance_meters')
            ->selectRaw('COALESCE(SUM(stop_count),0) as stop_count')
            ->selectRaw('COALESCE(SUM(visit_count),0) as visit_count')
            ->selectRaw('COALESCE(SUM(unknown_stop_count),0) as unknown_stop_count')
            ->selectRaw('COALESCE(SUM(travel_seconds),0) as travel_seconds')
            ->first();

        return [
            'items' => $items,
            'summary' => [
                'from' => $from->toDateString(),
                'to' => $to->toDateString(),
                'journey_count' => (int) ($aggregate->journey_count ?? 0),
                'distance_meters' => (int) ($aggregate->distance_meters ?? 0),
                'stop_count' => (int) ($aggregate->stop_count ?? 0),
                'visit_count' => (int) ($aggregate->visit_count ?? 0),
                'unknown_stop_count' => (int) ($aggregate->unknown_stop_count ?? 0),
                'travel_seconds' => (int) ($aggregate->travel_seconds ?? 0),
            ],
            'pagination' => [
                'total' => $paginator->total(),
                'per_page' => $paginator->perPage(),
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
            ],
            'agent' => [
                'id' => $target->id,
                'name' => $this->displayName($target),
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $options
     * @return array<string, mixed>
     */
    public function showJourney(User $actor, FieldActivitySession $session, array $options = []): array
    {
        $context = $this->attendanceAccessService->resolve(
            $actor,
            isset($options['company_id']) ? (int) $options['company_id'] : (int) $session->company_id,
        );
        $company = $context->company;

        if ((int) $session->company_id !== (int) $company->id) {
            throw ValidationException::withMessages([
                'session' => ['Journey not found in this organization.'],
            ]);
        }

        if ($context->isAgent() && (int) $actor->id !== (int) $session->user_id) {
            throw ValidationException::withMessages([
                'authorization' => ['Agents can only view their own journeys.'],
            ]);
        }

        if (! $context->isAgent()) {
            $this->attendanceAccessService->ensureCanManage($context);

            if ($context->role === 'supervisor') {
                $sessionUser = User::query()->find($session->user_id);
                if (! $sessionUser || (int) $sessionUser->supervisor_user_id !== (int) $actor->id) {
                    throw ValidationException::withMessages([
                        'authorization' => ['Supervisors can only view journeys of agents assigned to them.'],
                    ]);
                }
            }
        }

        $includeRoute = ($options['include_route'] ?? true) !== false;
        $includeTimeline = ($options['include_timeline'] ?? true) !== false;

        $summary = FieldDailySummary::query()
            ->where('field_activity_session_id', $session->id)
            ->first();

        $attendance = AttendanceRecord::query()->find($session->attendance_record_id)
            ?? AttendanceRecord::query()
                ->where('company_id', $session->company_id)
                ->where('user_id', $session->user_id)
                ->whereDate('attendance_date', $session->started_at?->toDateString())
                ->first();

        $stops = FieldStop::query()
            ->where('field_activity_session_id', $session->id)
            ->orderBy('arrived_at')
            ->with(['lead', 'companyLocation', 'task', 'meeting'])
            ->get();

        $stats = $this->buildStats($session, $stops, $summary);
        $timeline = $includeTimeline
            ? $this->buildTimeline($session, $attendance, $stops)
            : [];

        $route = $includeRoute ? $this->buildRouteGeometry($session, $attendance) : null;

        $agent = User::query()->find($session->user_id);

        $neighbors = $this->neighborJourneyIds(
            (int) $session->company_id,
            (int) $session->user_id,
            $session->started_at ?? now(),
        );

        return [
            'journey' => $this->serializeJourneyCard($session, $summary, $attendance),
            'agent' => [
                'id' => $session->user_id,
                'name' => $agent ? $this->displayName($agent) : null,
            ],
            'stats' => $stats,
            'stops' => $stops->map(fn (FieldStop $s): array => $this->sessionService->serializeStop($s))->all(),
            'timeline' => $timeline,
            'route' => $route,
            'navigation' => $neighbors,
            'playback' => [
                'supported' => true,
                'point_count' => $route['point_count'] ?? 0,
                'duration_seconds' => max(0, (int) ($session->travel_seconds + $session->stationary_seconds)),
                'speeds' => ['1x', '2x', '4x'],
            ],
        ];
    }

    /**
     * @return array{previous_id: int|null, next_id: int|null, previous_date: string|null, next_date: string|null}
     */
    private function neighborJourneyIds(int $companyId, int $userId, Carbon $currentStartedAt): array
    {
        $previous = FieldActivitySession::query()
            ->where('company_id', $companyId)
            ->where('user_id', $userId)
            ->where('started_at', '<', $currentStartedAt)
            ->orderByDesc('started_at')
            ->first();

        $next = FieldActivitySession::query()
            ->where('company_id', $companyId)
            ->where('user_id', $userId)
            ->where('started_at', '>', $currentStartedAt)
            ->orderBy('started_at')
            ->first();

        return [
            'previous_id' => $previous?->id,
            'next_id' => $next?->id,
            'previous_date' => $previous?->started_at?->toDateString(),
            'next_date' => $next?->started_at?->toDateString(),
        ];
    }

    /**
     * @param  Collection<int, FieldStop>  $stops
     * @return array<string, mixed>
     */
    private function buildStats(FieldActivitySession $session, Collection $stops, ?FieldDailySummary $summary): array
    {
        $visitSeconds = $stops->filter(static fn (FieldStop $s): bool => $s->isVisit())->sum('duration_seconds');
        $personalSeconds = $stops
            ->where('classification', FieldStopClassification::PERSONAL)
            ->sum('duration_seconds');
        $unknownCount = $stops->filter(static fn (FieldStop $s): bool => $s->isPending())->count();
        $visitCount = $stops->filter(static fn (FieldStop $s): bool => $s->isVisit())->count();
        $taskCount = $stops->whereNotNull('task_id')->unique('task_id')->count();
        $meetingCount = $stops->whereNotNull('meeting_id')->unique('meeting_id')->count();

        $travel = (int) $session->travel_seconds;
        $stationary = (int) $session->stationary_seconds;
        $active = $travel + $stationary;
        $efficiency = ($travel + $visitSeconds) > 0
            ? round($visitSeconds / ($travel + $visitSeconds), 3)
            : null;
        $productivity = $stops->count() > 0
            ? (int) round(($visitCount / $stops->count()) * 100)
            : 0;

        $speeds = $this->speedStats($session);

        return [
            'distance_meters' => (int) $session->distance_meters,
            'travel_seconds' => $travel,
            'stationary_seconds' => $stationary,
            'active_seconds' => $active,
            'stop_count' => $stops->count(),
            'visit_count' => $visitCount,
            'unknown_stop_count' => $unknownCount,
            'personal_stop_count' => (int) ($summary?->personal_stop_count ?? $stops->where('classification', FieldStopClassification::PERSONAL)->count()),
            'task_count' => $taskCount,
            'meeting_count' => $meetingCount,
            'visit_seconds' => (int) $visitSeconds,
            'personal_seconds' => (int) $personalSeconds,
            'travel_efficiency' => $efficiency,
            'productivity_score' => $productivity,
            'coverage_score' => null,
            'average_speed_kmh' => $speeds['average_speed_kmh'],
            'maximum_speed_kmh' => $speeds['maximum_speed_kmh'],
            'narrative' => $summary?->narrative,
        ];
    }

    /**
     * @return array{average_speed_kmh: float|null, maximum_speed_kmh: float|null}
     */
    private function speedStats(FieldActivitySession $session): array
    {
        $rows = FieldLocationPoint::query()
            ->where('field_activity_session_id', $session->id)
            ->whereNotNull('speed_mps')
            ->where('speed_mps', '>', 0)
            ->pluck('speed_mps');

        if ($rows->isEmpty()) {
            $distanceKm = ((int) $session->distance_meters) / 1000;
            $hours = max(0.01, ((int) $session->travel_seconds) / 3600);

            return [
                'average_speed_kmh' => $session->travel_seconds > 0 ? round($distanceKm / $hours, 1) : null,
                'maximum_speed_kmh' => null,
            ];
        }

        $kmh = $rows->map(static fn ($mps): float => (float) $mps * 3.6);

        return [
            'average_speed_kmh' => round((float) $kmh->avg(), 1),
            'maximum_speed_kmh' => round((float) $kmh->max(), 1),
        ];
    }

    /**
     * @param  Collection<int, FieldStop>  $stops
     * @return list<array<string, mixed>>
     */
    private function buildTimeline(
        FieldActivitySession $session,
        ?AttendanceRecord $attendance,
        Collection $stops,
    ): array {
        $events = [];
        $meta = is_array($attendance?->metadata) ? $attendance->metadata : [];

        if ($attendance?->clock_in_at) {
            $events[] = [
                'id' => 'clock_in_'.$session->id,
                'type' => 'clock_in',
                'label' => 'Clock In',
                'occurred_at' => $attendance->clock_in_at->toIso8601String(),
                'latitude' => isset($meta['clock_in_latitude']) ? (float) $meta['clock_in_latitude'] : $session->last_latitude,
                'longitude' => isset($meta['clock_in_longitude']) ? (float) $meta['clock_in_longitude'] : null,
                'address' => $meta['clock_in_address'] ?? null,
                'color' => 'green',
                'meta' => [],
            ];
        } elseif ($session->started_at) {
            $events[] = [
                'id' => 'session_start_'.$session->id,
                'type' => 'clock_in',
                'label' => 'Journey Started',
                'occurred_at' => $session->started_at->toIso8601String(),
                'latitude' => $session->last_latitude,
                'longitude' => null,
                'address' => null,
                'color' => 'green',
                'meta' => [],
            ];
        }

        foreach ($stops as $stop) {
            $type = match ($stop->classification) {
                FieldStopClassification::CUSTOMER_VISIT => 'customer_visit',
                FieldStopClassification::LEAD_VISIT => 'lead_visit',
                FieldStopClassification::ORG_VISIT => 'org_visit',
                FieldStopClassification::PERSONAL => 'personal',
                FieldStopClassification::IGNORE => 'ignored',
                default => $stop->meeting_id ? 'meeting' : ($stop->task_id ? 'task' : 'unknown_stop'),
            };

            if ($stop->meeting_id) {
                $type = 'meeting';
            } elseif ($stop->task_id && ! $stop->isVisit()) {
                $type = 'task';
            }

            $label = match ($type) {
                'customer_visit' => 'Customer Visit'.($stop->lead?->name ? ' · '.$stop->lead->name : ''),
                'lead_visit' => 'Lead Visit'.($stop->lead?->name ? ' · '.$stop->lead->name : ''),
                'org_visit' => 'Org Location'.($stop->companyLocation?->name ? ' · '.$stop->companyLocation->name : ''),
                'meeting' => 'Meeting'.($stop->meeting?->title ? ' · '.$stop->meeting->title : ''),
                'task' => 'Task'.($stop->task?->title ? ' · '.$stop->task->title : ''),
                'personal' => 'Personal Stop',
                'ignored' => 'Ignored Stop',
                default => 'Unknown Stop',
            };

            $color = match ($type) {
                'customer_visit', 'lead_visit' => 'orange',
                'meeting' => 'purple',
                'task', 'org_visit' => 'blue',
                'personal' => 'teal',
                default => 'gray',
            };

            $events[] = [
                'id' => 'stop_'.$stop->id,
                'type' => $type,
                'label' => $label,
                'occurred_at' => $stop->arrived_at?->toIso8601String(),
                'ended_at' => $stop->departed_at?->toIso8601String(),
                'duration_seconds' => (int) $stop->duration_seconds,
                'latitude' => $stop->latitude,
                'longitude' => $stop->longitude,
                'address' => $stop->address,
                'color' => $color,
                'stop_id' => $stop->id,
                'classification' => $stop->classification?->value,
                'meta' => [
                    'lead_id' => $stop->lead_id,
                    'task_id' => $stop->task_id,
                    'meeting_id' => $stop->meeting_id,
                    'company_location_id' => $stop->company_location_id,
                ],
            ];
        }

        if ($attendance?->clock_out_at) {
            $events[] = [
                'id' => 'clock_out_'.$session->id,
                'type' => 'clock_out',
                'label' => 'Clock Out',
                'occurred_at' => $attendance->clock_out_at->toIso8601String(),
                'latitude' => isset($meta['clock_out_latitude']) ? (float) $meta['clock_out_latitude'] : null,
                'longitude' => isset($meta['clock_out_longitude']) ? (float) $meta['clock_out_longitude'] : null,
                'address' => $meta['clock_out_address'] ?? null,
                'color' => 'red',
                'meta' => [],
            ];
        } elseif ($session->ended_at) {
            $events[] = [
                'id' => 'session_end_'.$session->id,
                'type' => 'clock_out',
                'label' => 'Journey Ended',
                'occurred_at' => $session->ended_at->toIso8601String(),
                'latitude' => $session->last_latitude,
                'longitude' => $session->last_longitude,
                'address' => null,
                'color' => 'red',
                'meta' => [],
            ];
        }

        usort($events, static function (array $a, array $b): int {
            return strcmp((string) ($a['occurred_at'] ?? ''), (string) ($b['occurred_at'] ?? ''));
        });

        // Insert travel segments between consecutive geo events for timeline readability.
        $withTravel = [];
        for ($i = 0; $i < count($events); $i++) {
            $withTravel[] = $events[$i];
            if ($i >= count($events) - 1) {
                continue;
            }
            $current = $events[$i];
            $next = $events[$i + 1];
            $start = isset($current['ended_at']) ? $current['ended_at'] : $current['occurred_at'];
            $end = $next['occurred_at'] ?? null;
            if (! $start || ! $end) {
                continue;
            }
            $startAt = Carbon::parse((string) $start);
            $endAt = Carbon::parse((string) $end);
            $gap = $startAt->diffInSeconds($endAt);
            if ($gap < 120) {
                continue;
            }
            if (in_array($current['type'], ['clock_out'], true) || in_array($next['type'], ['clock_in'], true)) {
                continue;
            }
            $withTravel[] = [
                'id' => 'travel_'.$i.'_'.$session->id,
                'type' => 'travel',
                'label' => 'Travel',
                'occurred_at' => $startAt->toIso8601String(),
                'ended_at' => $endAt->toIso8601String(),
                'duration_seconds' => $gap,
                'latitude' => null,
                'longitude' => null,
                'address' => null,
                'color' => 'blue',
                'meta' => [],
            ];
        }

        return $withTravel;
    }

    /**
     * @return array<string, mixed>
     */
    private function buildRouteGeometry(FieldActivitySession $session, ?AttendanceRecord $attendance): array
    {
        $points = FieldLocationPoint::query()
            ->where('field_activity_session_id', $session->id)
            ->orderBy('recorded_at')
            ->orderBy('id')
            ->get(['latitude', 'longitude', 'recorded_at', 'speed_mps', 'movement_state']);

        $rawCount = $points->count();
        $sampled = $this->downsamplePoints($points, self::MAX_ROUTE_POINTS);

        $coordinates = [];
        $timestamps = [];
        foreach ($sampled as $point) {
            $coordinates[] = [(float) $point->longitude, (float) $point->latitude];
            $timestamps[] = $point->recorded_at?->toIso8601String();
        }

        $meta = is_array($attendance?->metadata) ? $attendance->metadata : [];
        $clockIn = null;
        $clockOut = null;
        if (isset($meta['clock_in_latitude'], $meta['clock_in_longitude'])) {
            $clockIn = [
                'latitude' => (float) $meta['clock_in_latitude'],
                'longitude' => (float) $meta['clock_in_longitude'],
                'address' => $meta['clock_in_address'] ?? null,
            ];
        }
        if (isset($meta['clock_out_latitude'], $meta['clock_out_longitude'])) {
            $clockOut = [
                'latitude' => (float) $meta['clock_out_latitude'],
                'longitude' => (float) $meta['clock_out_longitude'],
                'address' => $meta['clock_out_address'] ?? null,
            ];
        }

        return [
            'type' => 'LineString',
            'coordinates' => $coordinates,
            'timestamps' => $timestamps,
            'point_count' => count($coordinates),
            'raw_point_count' => $rawCount,
            'downsampled' => $rawCount > count($coordinates),
            'clock_in' => $clockIn,
            'clock_out' => $clockOut,
            'bounds' => $this->boundsFromCoordinates($coordinates),
        ];
    }

    /**
     * @param  Collection<int, FieldLocationPoint>  $points
     * @return Collection<int, FieldLocationPoint>
     */
    private function downsamplePoints(Collection $points, int $max): Collection
    {
        $count = $points->count();
        if ($count <= $max || $max < 3) {
            return $points;
        }

        $step = $count / $max;
        $sampled = collect();
        for ($i = 0; $i < $max - 1; $i++) {
            $sampled->push($points[(int) floor($i * $step)]);
        }
        $sampled->push($points[$count - 1]);

        return $sampled->values();
    }

    /**
     * @param  list<array{0: float, 1: float}>  $coordinates
     * @return array{min_lng: float, min_lat: float, max_lng: float, max_lat: float}|null
     */
    private function boundsFromCoordinates(array $coordinates): ?array
    {
        if ($coordinates === []) {
            return null;
        }

        $lngs = array_column($coordinates, 0);
        $lats = array_column($coordinates, 1);

        return [
            'min_lng' => min($lngs),
            'min_lat' => min($lats),
            'max_lng' => max($lngs),
            'max_lat' => max($lats),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeJourneyCard(
        FieldActivitySession $session,
        ?FieldDailySummary $summary,
        ?AttendanceRecord $attendance,
    ): array {
        $date = $session->started_at?->toDateString();
        $travel = (int) $session->travel_seconds;
        $visitCount = (int) ($summary?->visit_count ?? $session->visit_count);
        $stopCount = (int) ($summary?->stop_count ?? $session->stop_count);
        $efficiency = null;
        if ($travel > 0 || $visitCount > 0) {
            $visitSecondsApprox = max(0, (int) $session->stationary_seconds);
            $efficiency = ($travel + $visitSecondsApprox) > 0
                ? round($visitSecondsApprox / ($travel + $visitSecondsApprox), 3)
                : null;
        }

        return [
            'id' => $session->id,
            'date' => $date,
            'status' => $session->status?->value ?? (string) $session->status,
            'clock_in_at' => $attendance?->clock_in_at?->toIso8601String() ?? $session->started_at?->toIso8601String(),
            'clock_out_at' => $attendance?->clock_out_at?->toIso8601String() ?? $session->ended_at?->toIso8601String(),
            'distance_meters' => (int) ($summary?->distance_meters ?? $session->distance_meters),
            'travel_seconds' => (int) ($summary?->travel_seconds ?? $session->travel_seconds),
            'stationary_seconds' => (int) ($summary?->stationary_seconds ?? $session->stationary_seconds),
            'active_seconds' => (int) $session->travel_seconds + (int) $session->stationary_seconds,
            'stop_count' => $stopCount,
            'visit_count' => $visitCount,
            'unknown_stop_count' => (int) ($summary?->unknown_stop_count ?? $session->unknown_stop_count),
            'travel_efficiency' => $efficiency,
            'narrative' => $summary?->narrative,
            'attendance_record_id' => $session->attendance_record_id,
        ];
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array{0: Carbon, 1: Carbon}
     */
    private function resolveDateRange(array $filters): array
    {
        $preset = (string) ($filters['preset'] ?? '');
        $today = now()->startOfDay();

        return match ($preset) {
            'today' => [$today->copy(), $today->copy()->endOfDay()],
            'this_week' => [$today->copy()->startOfWeek(), $today->copy()->endOfWeek()],
            'last_week' => [$today->copy()->subWeek()->startOfWeek(), $today->copy()->subWeek()->endOfWeek()],
            'last_30_days' => [$today->copy()->subDays(29), $today->copy()->endOfDay()],
            'last_90_days' => [$today->copy()->subDays(89), $today->copy()->endOfDay()],
            default => [
                isset($filters['from'])
                    ? Carbon::parse((string) $filters['from'])->startOfDay()
                    : $today->copy()->subDays(29),
                isset($filters['to'])
                    ? Carbon::parse((string) $filters['to'])->endOfDay()
                    : $today->copy()->endOfDay(),
            ],
        };
    }

    private function assertUserInCompany(User $user, int $companyId): void
    {
        $exists = $user->companies()->where('companies.id', $companyId)->exists();
        if (! $exists) {
            throw ValidationException::withMessages([
                'user' => ['Agent is not a member of this organization.'],
            ]);
        }
    }

    private function displayName(User $user): string
    {
        $name = trim((string) ($user->name ?? ''));

        return $name !== '' ? $name : 'Agent';
    }
}
