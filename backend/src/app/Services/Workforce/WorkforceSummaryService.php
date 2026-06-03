<?php

declare(strict_types=1);

namespace App\Services\Workforce;

use App\Models\Task;
use App\Models\TaskLocationPoint;
use App\Models\User;
use App\Services\Analytics\AggregateCacheService;
use App\Services\Company\CompanyContextService;
use Carbon\Carbon;

class WorkforceSummaryService
{
    public function __construct(
        private readonly CompanyContextService $companyContextService,
        private readonly AggregateCacheService $cacheService,
    ) {}

    public function summary(User $user, ?int $companyId = null, ?string $fromDate = null, ?string $toDate = null): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $role = (string) $context['role'];

        [$from, $to] = $this->resolveRange($fromDate, $toDate);

        $cacheVariant = implode('|', [
            $role,
            (string) $user->id,
            $from->toDateString(),
            $to->toDateString(),
        ]);

        return $this->cacheService->rememberForCompany(
            companyId: $resolvedCompanyId,
            scope: 'workforce.summary',
            variant: $cacheVariant,
            ttlSeconds: 120,
            resolver: function () use ($resolvedCompanyId, $from, $to): array {
                $agents = User::query()
                    ->where('internal_role', 'agent')
                    ->whereExists(function ($query) use ($resolvedCompanyId): void {
                        $query->selectRaw('1')
                            ->from('company_users')
                            ->whereColumn('company_users.user_id', 'users.id')
                            ->where('company_users.company_id', $resolvedCompanyId);
                    })
                    ->get(['id', 'name', 'email', 'is_active', 'onboarding_status']);

                $taskBase = Task::query()
                    ->where('company_id', $resolvedCompanyId)
                    ->whereBetween('created_at', [$from->copy()->startOfDay(), $to->copy()->endOfDay()]);

                $openTasks = Task::query()
                    ->where('company_id', $resolvedCompanyId)
                    ->whereIn('status', ['pending', 'in_progress']);

                $workload = (clone $openTasks)
                    ->selectRaw('assigned_agent_id, COUNT(*) as total_open_tasks')
                    ->whereNotNull('assigned_agent_id')
                    ->groupBy('assigned_agent_id')
                    ->orderByDesc('total_open_tasks')
                    ->limit(5)
                    ->get();

                $agentMap = $agents->keyBy('id');

                $recentTracking = TaskLocationPoint::query()
                    ->where('company_id', $resolvedCompanyId)
                    ->where('recorded_at', '>=', now()->subMinutes(30))
                    ->selectRaw('user_id, MAX(recorded_at) as last_seen_at')
                    ->groupBy('user_id')
                    ->get();

                return [
                    'range' => [
                        'from_date' => $from->toDateString(),
                        'to_date' => $to->toDateString(),
                    ],
                    'agent_summary' => [
                        'total_agents' => (int) $agents->count(),
                        'active_agents' => (int) $agents->where('is_active', true)->count(),
                        'inactive_agents' => (int) $agents->where('is_active', false)->count(),
                        'pending_onboarding' => (int) $agents->where('onboarding_status', 'pending_onboarding')->count(),
                    ],
                    'task_distribution' => [
                        'pending' => (int) (clone $taskBase)->where('status', 'pending')->count(),
                        'in_progress' => (int) (clone $taskBase)->where('status', 'in_progress')->count(),
                        'completed' => (int) (clone $taskBase)->where('status', 'completed')->count(),
                        'cancelled' => (int) (clone $taskBase)->where('status', 'cancelled')->count(),
                    ],
                    'attendance_proxy' => [
                        'agents_with_location_ping_last_30m' => (int) $recentTracking->count(),
                        'agents_without_location_ping_last_30m' => max(0, $agents->count() - $recentTracking->count()),
                    ],
                    'workload_top_agents' => $workload->map(static function ($item) use ($agentMap): array {
                        $agent = $agentMap->get((int) $item->assigned_agent_id);

                        return [
                            'agent_id' => (int) $item->assigned_agent_id,
                            'agent_name' => $agent?->name,
                            'agent_email' => $agent?->email,
                            'open_tasks' => (int) $item->total_open_tasks,
                        ];
                    })->values()->all(),
                    'recent_tracking' => $recentTracking->map(static function ($item) use ($agentMap): array {
                        $agent = $agentMap->get((int) $item->user_id);

                        return [
                            'agent_id' => (int) $item->user_id,
                            'agent_name' => $agent?->name,
                            'last_seen_at' => $item->last_seen_at !== null
                                ? Carbon::parse((string) $item->last_seen_at)->toIso8601String()
                                : null,
                        ];
                    })->values()->all(),
                ];
            },
        );
    }

    private function resolveRange(?string $fromDate, ?string $toDate): array
    {
        $to = $toDate ? Carbon::parse($toDate)->endOfDay() : now()->endOfDay();
        $from = $fromDate ? Carbon::parse($fromDate)->startOfDay() : $to->copy()->subDays(6)->startOfDay();

        if ($from->gt($to)) {
            [$from, $to] = [$to->copy()->startOfDay(), $from->copy()->endOfDay()];
        }

        return [$from, $to];
    }
}
