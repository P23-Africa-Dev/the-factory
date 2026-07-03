<?php

declare(strict_types=1);

namespace App\Services\Territory;

use App\Models\AgentTerritory;
use App\Models\User;
use App\Services\Company\CompanyContextService;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class TerritoryService
{
    /**
     * Distinct, colorblind-spaced palette used for stable per-agent colors.
     *
     * @var list<string>
     */
    public const PALETTE = [
        '#5B5BD6',
        '#E93D82',
        '#12A594',
        '#FFA01C',
        '#8E4EC6',
        '#0EA5E9',
        '#DC2626',
        '#16A34A',
        '#D97706',
        '#DB2777',
        '#0891B2',
        '#65A30D',
    ];

    public const MAX_TRAIL_POINTS_PER_AGENT = 300;

    public const MAX_MANUAL_POLYGON_VERTICES = 500;

    private const TRAIL_LOOKBACK_DAYS = 30;

    private const TRAIL_FETCH_CEILING = 5000;

    public function __construct(private readonly CompanyContextService $companyContextService) {}

    /**
     * Territory rows for every current agent in the company, lazily created so
     * each agent keeps a stable color across sessions.
     */
    public function listForCompany(User $actor, array $filters): array
    {
        $context = $this->companyContextService->resolve($actor, $filters['company_id'] ?? null);
        $companyId = (int) $context['company']->id;
        $this->assertManagementRole((string) $context['role']);

        $agents = $this->companyAgents($companyId);
        $territories = $this->ensureTerritoryRows($companyId, $agents);

        return [
            'items' => $territories
                ->map(fn (AgentTerritory $territory): array => $this->serializeTerritory(
                    $territory,
                    $agents->get($territory->user_id),
                ))
                ->values()
                ->all(),
            'meta' => [
                'company_id' => $companyId,
                'palette' => self::PALETTE,
                'generated_at' => now()->toIso8601String(),
            ],
        ];
    }

    /**
     * Coverage points (upcoming task destinations + sampled recent trail points)
     * that drive auto-computed territories on the client.
     */
    public function coveragePoints(User $actor, array $filters): array
    {
        $context = $this->companyContextService->resolve($actor, $filters['company_id'] ?? null);
        $companyId = (int) $context['company']->id;
        $role = (string) $context['role'];

        $agentIds = $this->companyAgents($companyId)->keys();

        if ($role === 'agent') {
            $agentIds = $agentIds->intersect([(int) $actor->id])->values();
        } elseif (! empty($filters['user_ids'])) {
            $requested = array_map(intval(...), (array) $filters['user_ids']);
            $agentIds = $agentIds->intersect($requested)->values();
        }

        $items = $agentIds
            ->map(fn (int $agentId): array => [
                'user_id' => $agentId,
                'task_points' => $this->upcomingTaskPoints($companyId, $agentId),
                'trail_points' => $this->sampledTrailPoints($companyId, $agentId),
            ])
            ->values()
            ->all();

        return [
            'items' => $items,
            'meta' => [
                'company_id' => $companyId,
                'trail_lookback_days' => self::TRAIL_LOOKBACK_DAYS,
                'max_trail_points_per_agent' => self::MAX_TRAIL_POINTS_PER_AGENT,
                'generated_at' => now()->toIso8601String(),
            ],
        ];
    }

    public function upsertManual(User $actor, User $agent, array $data): array
    {
        $context = $this->companyContextService->resolve($actor, $data['company_id'] ?? null);
        $companyId = (int) $context['company']->id;
        $this->assertManagementRole((string) $context['role'], ownerAdminOnly: true);
        $this->assertCompanyAgent($companyId, $agent);

        $geojson = $data['geojson'] ?? null;
        if ($geojson !== null) {
            $this->assertValidPolygon($geojson);
        }

        $agents = $this->companyAgents($companyId);
        $existing = AgentTerritory::query()
            ->where('company_id', $companyId)
            ->where('user_id', $agent->id)
            ->first();

        $territory = AgentTerritory::query()->updateOrCreate(
            ['company_id' => $companyId, 'user_id' => $agent->id],
            array_filter([
                'name' => array_key_exists('name', $data) ? ($data['name'] ?? null) : ($existing?->name),
                'color' => $data['color'] ?? $existing?->color ?? $this->nextFreeColor($companyId),
                'mode' => $geojson !== null ? AgentTerritory::MODE_MANUAL : ($existing?->mode ?? AgentTerritory::MODE_AUTO),
                'geojson' => $geojson ?? $existing?->geojson,
                'is_visible' => array_key_exists('is_visible', $data) ? (bool) $data['is_visible'] : ($existing?->is_visible ?? true),
                'created_by_user_id' => $existing?->created_by_user_id ?? $actor->id,
                'updated_by_user_id' => $actor->id,
            ], static fn ($value): bool => $value !== null),
        );

        return [
            'territory' => $this->serializeTerritory($territory->fresh(), $agents->get((int) $agent->id)),
        ];
    }

    public function resetToAuto(User $actor, User $agent, array $filters): array
    {
        $context = $this->companyContextService->resolve($actor, $filters['company_id'] ?? null);
        $companyId = (int) $context['company']->id;
        $this->assertManagementRole((string) $context['role'], ownerAdminOnly: true);
        $this->assertCompanyAgent($companyId, $agent);

        $territory = AgentTerritory::query()
            ->where('company_id', $companyId)
            ->where('user_id', $agent->id)
            ->first();

        if ($territory !== null) {
            $territory->update([
                'mode' => AgentTerritory::MODE_AUTO,
                'geojson' => null,
                'updated_by_user_id' => $actor->id,
            ]);
        }

        return [
            'reset_user_id' => (int) $agent->id,
        ];
    }

    /**
     * The acting agent's own territory + coverage points.
     */
    public function forAgent(User $actor, array $filters): array
    {
        $context = $this->companyContextService->resolve($actor, $filters['company_id'] ?? null);
        $companyId = (int) $context['company']->id;

        if ((string) $context['role'] !== 'agent') {
            throw ValidationException::withMessages([
                'authorization' => ['This endpoint is only available to agents.'],
            ]);
        }

        $agents = $this->companyAgents($companyId);
        $territories = $this->ensureTerritoryRows(
            $companyId,
            $agents->only([(int) $actor->id]),
        );

        $territory = $territories->firstWhere('user_id', (int) $actor->id);

        return [
            'territory' => $territory !== null
                ? $this->serializeTerritory($territory, $agents->get((int) $actor->id))
                : null,
            'coverage' => [
                'user_id' => (int) $actor->id,
                'task_points' => $this->upcomingTaskPoints($companyId, (int) $actor->id),
                'trail_points' => $this->sampledTrailPoints($companyId, (int) $actor->id),
            ],
            'meta' => [
                'company_id' => $companyId,
                'trail_lookback_days' => self::TRAIL_LOOKBACK_DAYS,
                'generated_at' => now()->toIso8601String(),
            ],
        ];
    }

    /**
     * @return Collection<int, object> keyed by user id
     */
    private function companyAgents(int $companyId)
    {
        return DB::table('company_users')
            ->join('users', 'users.id', '=', 'company_users.user_id')
            ->where('company_users.company_id', $companyId)
            ->where('company_users.role', 'agent')
            ->whereNull('users.deleted_at')
            ->where('users.is_active', true)
            ->orderBy('users.id')
            ->get([
                'users.id',
                'users.name',
                'users.email',
                'users.avatar',
                'users.assigned_zone',
            ])
            ->keyBy('id');
    }

    /**
     * @param  Collection<int, object>  $agents
     * @return Collection<int, AgentTerritory>
     */
    private function ensureTerritoryRows(int $companyId, $agents)
    {
        $existing = AgentTerritory::query()
            ->where('company_id', $companyId)
            ->whereIn('user_id', $agents->keys())
            ->get()
            ->keyBy('user_id');

        $usedColors = AgentTerritory::query()
            ->where('company_id', $companyId)
            ->pluck('color')
            ->all();

        foreach ($agents->keys() as $agentId) {
            if ($existing->has($agentId)) {
                continue;
            }

            $color = $this->nextFreeColor($companyId, $usedColors);
            $usedColors[] = $color;

            $existing->put($agentId, AgentTerritory::query()->create([
                'company_id' => $companyId,
                'user_id' => $agentId,
                'color' => $color,
                'mode' => AgentTerritory::MODE_AUTO,
                'is_visible' => true,
            ]));
        }

        return $existing->sortKeys()->values();
    }

    private function nextFreeColor(int $companyId, ?array $usedColors = null): string
    {
        $used = $usedColors ?? AgentTerritory::query()
            ->where('company_id', $companyId)
            ->pluck('color')
            ->all();

        foreach (self::PALETTE as $color) {
            if (! in_array($color, $used, true)) {
                return $color;
            }
        }

        return self::PALETTE[count($used) % count(self::PALETTE)];
    }

    /**
     * @return list<array{latitude: float, longitude: float, weight: int}>
     */
    private function upcomingTaskPoints(int $companyId, int $agentId): array
    {
        return DB::table('tasks')
            ->where('company_id', $companyId)
            ->where('assigned_agent_id', $agentId)
            ->whereIn('status', ['pending', 'in_progress', 'paused', 'resumed'])
            ->whereNotNull('latitude')
            ->whereNotNull('longitude')
            ->orderByDesc('due_at')
            ->limit(100)
            ->get(['latitude', 'longitude'])
            ->map(static fn (object $row): array => [
                'latitude' => (float) $row->latitude,
                'longitude' => (float) $row->longitude,
                'weight' => 2,
            ])
            ->all();
    }

    /**
     * Recent trail points, downsampled server-side to keep payloads small.
     *
     * @return list<array{latitude: float, longitude: float, weight: int}>
     */
    private function sampledTrailPoints(int $companyId, int $agentId): array
    {
        $points = DB::table('task_location_points')
            ->where('company_id', $companyId)
            ->where('user_id', $agentId)
            ->where('recorded_at', '>=', now()->subDays(self::TRAIL_LOOKBACK_DAYS))
            ->orderByDesc('recorded_at')
            ->limit(self::TRAIL_FETCH_CEILING)
            ->get(['latitude', 'longitude']);

        $total = $points->count();
        if ($total === 0) {
            return [];
        }

        $step = (int) max(1, ceil($total / self::MAX_TRAIL_POINTS_PER_AGENT));

        return $points
            ->nth($step)
            ->map(static fn (object $row): array => [
                'latitude' => (float) $row->latitude,
                'longitude' => (float) $row->longitude,
                'weight' => 1,
            ])
            ->values()
            ->all();
    }

    private function serializeTerritory(AgentTerritory $territory, ?object $agent): array
    {
        return [
            'id' => $territory->id,
            'user_id' => $territory->user_id,
            'agent' => $agent !== null ? [
                'id' => (int) $agent->id,
                'name' => $agent->name,
                'email' => $agent->email,
                'avatar' => $agent->avatar,
                'assigned_zone' => $agent->assigned_zone,
            ] : null,
            'name' => $territory->name ?? $agent?->name,
            'color' => $territory->color,
            'mode' => $territory->mode,
            'geojson' => $territory->mode === AgentTerritory::MODE_MANUAL ? $territory->geojson : null,
            'is_visible' => $territory->is_visible,
            'updated_at' => $territory->updated_at?->toIso8601String(),
        ];
    }

    private function assertManagementRole(string $role, bool $ownerAdminOnly = false): void
    {
        $allowed = $ownerAdminOnly ? ['owner', 'admin'] : ['owner', 'admin', 'supervisor'];

        if (! in_array($role, $allowed, true)) {
            throw ValidationException::withMessages([
                'authorization' => ['You are not permitted to manage agent territories.'],
            ]);
        }
    }

    private function assertCompanyAgent(int $companyId, User $agent): void
    {
        $isAgent = DB::table('company_users')
            ->where('company_id', $companyId)
            ->where('user_id', $agent->id)
            ->where('role', 'agent')
            ->exists();

        if (! $isAgent) {
            throw ValidationException::withMessages([
                'user' => ['Selected user is not an agent in the active company context.'],
            ]);
        }
    }

    private function assertValidPolygon(mixed $geojson): void
    {
        if (! is_array($geojson) || ($geojson['type'] ?? null) !== 'Polygon') {
            throw ValidationException::withMessages([
                'geojson' => ['Territory geometry must be a GeoJSON Polygon.'],
            ]);
        }

        $rings = $geojson['coordinates'] ?? null;
        if (! is_array($rings) || $rings === [] || ! is_array($rings[0])) {
            throw ValidationException::withMessages([
                'geojson' => ['Territory polygon coordinates are malformed.'],
            ]);
        }

        $outerRing = $rings[0];
        $vertexCount = count($outerRing);

        if ($vertexCount < 4 || $vertexCount > self::MAX_MANUAL_POLYGON_VERTICES) {
            throw ValidationException::withMessages([
                'geojson' => [sprintf(
                    'Territory polygon must have between 4 and %d vertices (including the closing vertex).',
                    self::MAX_MANUAL_POLYGON_VERTICES,
                )],
            ]);
        }

        foreach ($outerRing as $vertex) {
            if (
                ! is_array($vertex)
                || count($vertex) < 2
                || ! is_numeric($vertex[0])
                || ! is_numeric($vertex[1])
                || abs((float) $vertex[0]) > 180
                || abs((float) $vertex[1]) > 90
            ) {
                throw ValidationException::withMessages([
                    'geojson' => ['Territory polygon contains an invalid coordinate.'],
                ]);
            }
        }

        $first = $outerRing[0];
        $last = $outerRing[$vertexCount - 1];
        if ((float) $first[0] !== (float) $last[0] || (float) $first[1] !== (float) $last[1]) {
            throw ValidationException::withMessages([
                'geojson' => ['Territory polygon outer ring must be closed.'],
            ]);
        }
    }
}
