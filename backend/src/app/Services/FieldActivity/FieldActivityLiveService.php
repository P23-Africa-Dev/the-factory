<?php

declare(strict_types=1);

namespace App\Services\FieldActivity;

use App\Enums\FieldActivitySessionStatus;
use App\Models\FieldActivitySession;
use App\Models\FieldLocationPoint;
use App\Models\FieldStop;
use App\Models\User;
use App\Services\Attendance\AttendanceAccessService;
use App\Support\AvatarUrlResolver;
use App\Support\CompanyClock;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class FieldActivityLiveService
{
    private const MAX_ROUTE_POINTS = 400;

    public function __construct(
        private readonly AttendanceAccessService $attendanceAccessService,
        private readonly FieldActivitySessionService $sessionService,
    ) {}

    /**
     * Hydrate today's active field-activity sessions for the management live map.
     *
     * @param  array<string, mixed>  $filters
     * @return array{date: string, agents: list<array<string, mixed>>}
     */
    public function liveForManagement(User $actor, array $filters = []): array
    {
        $context = $this->attendanceAccessService->resolve(
            $actor,
            isset($filters['company_id']) ? (int) $filters['company_id'] : null,
        );
        $this->attendanceAccessService->ensureCanManage($context);

        $companyId = (int) $context->company->id;
        // "Today" is the company's day, not the server's.
        $today = CompanyClock::today($companyId);
        $date = isset($filters['date']) && is_string($filters['date']) && $filters['date'] !== ''
            ? $filters['date']
            : $today;

        $isToday = $date === $today;
        [$dayStart, $dayEnd] = CompanyClock::dayBounds($companyId, $date);

        $sessions = FieldActivitySession::query()
            ->with('user')
            ->where('company_id', $companyId)
            ->where('status', FieldActivitySessionStatus::ACTIVE)
            // Today: every running trip, even one started before midnight.
            ->when(! $isToday, fn ($q) => $q->whereBetween('started_at', [$dayStart, $dayEnd]))
            // Supervisors see their own team and themselves, like the rest of tracking.
            ->when($context->role === 'supervisor', function ($q) use ($actor): void {
                $q->where(function ($inner) use ($actor): void {
                    $inner->where('user_id', $actor->id)
                        ->orWhereIn('user_id', User::query()->select('id')->where('supervisor_user_id', $actor->id));
                });
            })
            ->orderByDesc('started_at')
            ->get();

        $sessionIds = $sessions->pluck('id')->all();
        [$pointsBySession, $rawCounts] = $this->loadDownsampledPoints($sessionIds);
        $stopsBySession = FieldStop::query()
            ->whereIn('field_activity_session_id', $sessionIds)
            ->orderBy('arrived_at')
            ->get()
            ->groupBy('field_activity_session_id');

        $agents = $sessions->map(function (FieldActivitySession $session) use ($pointsBySession, $stopsBySession, $rawCounts): array {
            /** @var Collection<int, object{latitude: mixed, longitude: mixed}> $points */
            $points = $pointsBySession->get($session->id, collect());
            /** @var Collection<int, FieldStop> $stops */
            $stops = $stopsBySession->get($session->id, collect());

            $coordinates = $points
                ->map(fn (object $p): array => [(float) $p->longitude, (float) $p->latitude])
                ->values()
                ->all();

            $user = $session->user;
            $name = trim((string) ($user?->name ?? ''));

            return [
                'user_id' => (int) $session->user_id,
                'name' => $name !== '' ? $name : 'Agent',
                'avatar_url' => AvatarUrlResolver::resolveOrDefault($user?->avatar, $user?->gender),
                'session' => $this->sessionService->serializeSession($session),
                'last_latitude' => $session->last_latitude !== null ? (float) $session->last_latitude : null,
                'last_longitude' => $session->last_longitude !== null ? (float) $session->last_longitude : null,
                'last_movement_state' => $session->last_movement_state?->value,
                'last_recorded_at' => $session->last_recorded_at?->toIso8601String(),
                'route' => [
                    'coordinates' => $coordinates,
                    'raw_point_count' => (int) ($rawCounts[$session->id] ?? 0),
                    'point_count' => count($coordinates),
                ],
                'stops' => $stops
                    ->map(fn (FieldStop $stop): array => $this->sessionService->serializeStop($stop))
                    ->values()
                    ->all(),
            ];
        })->values()->all();

        $routePointCount = collect($agents)->sum(
            static fn (array $agent): int => (int) ($agent['route']['point_count'] ?? 0),
        );
        $stopCount = collect($agents)->sum(
            static fn (array $agent): int => count($agent['stops'] ?? []),
        );

        Log::info('field_activity.live.hydrated', [
            'company_id' => $companyId,
            'date' => $date,
            'agent_count' => count($agents),
            'route_point_count' => $routePointCount,
            'stop_count' => $stopCount,
        ]);

        return [
            'date' => $date,
            'agents' => $agents,
        ];
    }

    /**
     * Routes thinned in SQL to at most MAX_ROUTE_POINTS per session (every
     * n-th point plus the last one), selecting only what the map draws.
     *
     * @param  list<int>  $sessionIds
     * @return array{0: Collection<int, Collection<int, object>>, 1: array<int, int>}
     */
    private function loadDownsampledPoints(array $sessionIds): array
    {
        if ($sessionIds === []) {
            return [collect(), []];
        }

        $rawCounts = FieldLocationPoint::query()
            ->whereIn('field_activity_session_id', $sessionIds)
            ->groupBy('field_activity_session_id')
            ->selectRaw('field_activity_session_id, COUNT(*) as point_count')
            ->pluck('point_count', 'field_activity_session_id')
            ->mapWithKeys(static fn ($count, $id): array => [(int) $id => (int) $count])
            ->all();

        if ($rawCounts === []) {
            return [collect(), []];
        }

        $stepCase = 'CASE field_activity_session_id';
        $lastCase = 'CASE field_activity_session_id';
        $stepBindings = [];
        $lastBindings = [];
        foreach ($rawCounts as $sessionId => $count) {
            $stepCase .= ' WHEN ? THEN ?';
            $lastCase .= ' WHEN ? THEN ?';
            array_push($stepBindings, $sessionId, max(1, (int) ceil($count / self::MAX_ROUTE_POINTS)));
            array_push($lastBindings, $sessionId, $count);
        }
        $stepCase .= ' ELSE 1 END';
        $lastCase .= ' ELSE 0 END';

        $numbered = DB::table('field_location_points')
            ->select(['field_activity_session_id', 'latitude', 'longitude', 'recorded_at'])
            ->selectRaw('ROW_NUMBER() OVER (PARTITION BY field_activity_session_id ORDER BY recorded_at, id) AS rn')
            ->whereIn('field_activity_session_id', array_keys($rawCounts));

        $rows = DB::query()
            ->fromSub($numbered, 'p')
            ->select(['field_activity_session_id', 'latitude', 'longitude', 'recorded_at'])
            ->whereRaw("((rn - 1) % ({$stepCase}) = 0 OR rn = ({$lastCase}))", [...$stepBindings, ...$lastBindings])
            ->orderBy('field_activity_session_id')
            ->orderBy('rn')
            ->get();

        $grouped = $rows
            ->groupBy(static fn (object $row): int => (int) $row->field_activity_session_id)
            ->map(static fn (Collection $points): Collection => $points->values());

        return [$grouped, $rawCounts];
    }
}
