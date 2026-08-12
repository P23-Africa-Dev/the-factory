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
use Illuminate\Support\Collection;
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
        $date = isset($filters['date']) && is_string($filters['date']) && $filters['date'] !== ''
            ? $filters['date']
            : now()->toDateString();

        $sessions = FieldActivitySession::query()
            ->with('user')
            ->where('company_id', $companyId)
            ->where('status', FieldActivitySessionStatus::ACTIVE)
            ->whereDate('started_at', $date)
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
            /** @var Collection<int, FieldLocationPoint> $points */
            $points = $pointsBySession->get($session->id, collect());
            /** @var Collection<int, FieldStop> $stops */
            $stops = $stopsBySession->get($session->id, collect());

            $coordinates = $points
                ->map(fn (FieldLocationPoint $p): array => [(float) $p->longitude, (float) $p->latitude])
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
     * @param  list<int>  $sessionIds
     * @return array{0: Collection<int, Collection<int, FieldLocationPoint>>, 1: array<int, int>}
     */
    private function loadDownsampledPoints(array $sessionIds): array
    {
        if ($sessionIds === []) {
            return [collect(), []];
        }

        $all = FieldLocationPoint::query()
            ->whereIn('field_activity_session_id', $sessionIds)
            ->orderBy('recorded_at')
            ->orderBy('id')
            ->get()
            ->groupBy('field_activity_session_id');

        $rawCounts = [];
        $downsampled = $all->map(function (Collection $points, $sessionId) use (&$rawCounts): Collection {
            $rawCounts[(int) $sessionId] = $points->count();

            return $this->downsamplePoints($points, self::MAX_ROUTE_POINTS);
        });

        return [$downsampled, $rawCounts];
    }

    /**
     * @param  Collection<int, FieldLocationPoint>  $points
     * @return Collection<int, FieldLocationPoint>
     */
    private function downsamplePoints(Collection $points, int $max): Collection
    {
        $count = $points->count();
        if ($count <= $max) {
            return $points->values();
        }

        $step = ($count - 1) / ($max - 1);
        $sampled = collect();
        for ($i = 0; $i < $max - 1; $i++) {
            $sampled->push($points[(int) floor($i * $step)]);
        }
        $sampled->push($points[$count - 1]);

        return $sampled->values();
    }
}
