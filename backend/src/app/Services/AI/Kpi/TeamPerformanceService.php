<?php

declare(strict_types=1);

namespace App\Services\AI\Kpi;

use App\Enums\LeadStatus;
use App\Enums\TaskStatus;
use App\Models\AttendanceRecord;
use App\Models\Lead;
use App\Models\Task;
use App\Models\User;
use App\Services\Company\CompanyContextService;

class TeamPerformanceService
{
    public function __construct(private readonly CompanyContextService $companyContextService) {}

    /**
     * @param  array<string, mixed>  $args
     * @return array<string, mixed>
     */
    public function analyze(User $user, int $companyId, array $args = []): array
    {
        $context = $this->companyContextService->resolve($user, $companyId);
        $resolvedCompanyId = (int) $context['company']->id;
        $role = (string) $context['role'];

        if ($role === 'agent') {
            return [
                'tool' => 'kpi.team_performance',
                'summary' => 'Team performance rankings are available to supervisors, admins, and owners. I can show your personal task and activity summary instead.',
                'payload' => [
                    'denied' => true,
                    'reason' => 'agent_scope',
                ],
                'sources' => ['kpi.team_performance'],
            ];
        }

        $days = max(7, min(90, (int) ($args['days'] ?? 30)));
        $from = now()->subDays($days)->startOfDay();
        $to = now()->endOfDay();

        $agents = User::query()
            ->where('internal_role', 'agent')
            ->where('is_active', true)
            ->whereExists(function ($query) use ($resolvedCompanyId): void {
                $query->selectRaw('1')
                    ->from('company_users')
                    ->whereColumn('company_users.user_id', 'users.id')
                    ->where('company_users.company_id', $resolvedCompanyId);
            })
            ->get(['id', 'name', 'email']);

        if ($agents->isEmpty()) {
            return [
                'tool' => 'kpi.team_performance',
                'summary' => 'No active field agents were found in your organization, so team performance rankings are not available yet.',
                'payload' => [
                    'range_days' => $days,
                    'rankings' => [],
                    'top_performer' => null,
                    'lowest_performer' => null,
                ],
                'sources' => ['kpi.team_performance'],
            ];
        }

        $agentIds = $agents->pluck('id')->all();

        $completedTasks = Task::query()
            ->selectRaw('assigned_agent_id as agent_id, COUNT(*) as total')
            ->where('company_id', $resolvedCompanyId)
            ->whereIn('assigned_agent_id', $agentIds)
            ->where('status', TaskStatus::COMPLETED->value)
            ->whereBetween('completed_at', [$from, $to])
            ->groupBy('assigned_agent_id')
            ->pluck('total', 'agent_id');

        $leadsWon = Lead::query()
            ->selectRaw('assigned_to_user_id as agent_id, COUNT(*) as total')
            ->where('company_id', $resolvedCompanyId)
            ->whereIn('assigned_to_user_id', $agentIds)
            ->where('status', LeadStatus::WON->value)
            ->whereBetween('updated_at', [$from, $to])
            ->groupBy('assigned_to_user_id')
            ->pluck('total', 'agent_id');

        $leadsCreated = Lead::query()
            ->selectRaw('created_by_user_id as agent_id, COUNT(*) as total')
            ->where('company_id', $resolvedCompanyId)
            ->whereIn('created_by_user_id', $agentIds)
            ->whereBetween('created_at', [$from, $to])
            ->groupBy('created_by_user_id')
            ->pluck('total', 'agent_id');

        $attendanceDays = AttendanceRecord::query()
            ->selectRaw('user_id as agent_id, COUNT(DISTINCT DATE(clock_in_at)) as total')
            ->where('company_id', $resolvedCompanyId)
            ->whereIn('user_id', $agentIds)
            ->whereNotNull('clock_in_at')
            ->whereBetween('clock_in_at', [$from, $to])
            ->groupBy('user_id')
            ->pluck('total', 'agent_id');

        $rankings = $agents->map(function (User $agent) use ($completedTasks, $leadsWon, $leadsCreated, $attendanceDays): array {
            $agentId = (int) $agent->id;
            $tasksCompleted = (int) ($completedTasks[$agentId] ?? 0);
            $won = (int) ($leadsWon[$agentId] ?? 0);
            $leadsAdded = (int) ($leadsCreated[$agentId] ?? 0);
            $daysPresent = (int) ($attendanceDays[$agentId] ?? 0);

            $score = ($tasksCompleted * 10) + ($won * 25) + ($leadsAdded * 8) + ($daysPresent * 3);

            return [
                'agent_id' => $agentId,
                'agent_name' => (string) $agent->name,
                'score' => $score,
                'metrics' => [
                    'completed_tasks' => $tasksCompleted,
                    'leads_won' => $won,
                    'leads_created' => $leadsAdded,
                    'attendance_days' => $daysPresent,
                ],
            ];
        })->sortByDesc('score')->values();

        $ranked = $rankings->map(function (array $row, int $index): array {
            $row['rank'] = $index + 1;

            return $row;
        })->values()->all();

        $top = $ranked[0] ?? null;
        $lowest = $ranked !== [] ? $ranked[count($ranked) - 1] : null;

        $summary = $this->buildSummary($ranked, $top, $lowest, $days);

        return [
            'tool' => 'kpi.team_performance',
            'summary' => $summary,
            'payload' => [
                'range_days' => $days,
                'from_date' => $from->toDateString(),
                'to_date' => $to->toDateString(),
                'rankings' => $ranked,
                'top_performer' => $top,
                'lowest_performer' => $lowest,
            ],
            'sources' => ['kpi.team_performance'],
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $ranked
     * @param  array<string, mixed>|null  $top
     * @param  array<string, mixed>|null  $lowest
     */
    private function buildSummary(array $ranked, ?array $top, ?array $lowest, int $days): string
    {
        if ($top === null || $lowest === null) {
            return 'No team performance data is available for the selected period.';
        }

        if (count($ranked) === 1) {
            return sprintf(
                'Only one active agent was found in the last %d days: %s (score %d).',
                $days,
                $top['agent_name'],
                $top['score'],
            );
        }

        $topMetrics = is_array($top['metrics'] ?? null) ? $top['metrics'] : [];
        $lowMetrics = is_array($lowest['metrics'] ?? null) ? $lowest['metrics'] : [];

        $parts = [
            sprintf(
                'Top performer: %s — %d completed tasks, %d leads won, %d attendance days in the last %d days.',
                $top['agent_name'],
                (int) ($topMetrics['completed_tasks'] ?? 0),
                (int) ($topMetrics['leads_won'] ?? 0),
                (int) ($topMetrics['attendance_days'] ?? 0),
                $days,
            ),
            sprintf(
                'Needs the most support: %s — %d completed tasks, %d leads won, %d attendance days in the same period.',
                $lowest['agent_name'],
                (int) ($lowMetrics['completed_tasks'] ?? 0),
                (int) ($lowMetrics['leads_won'] ?? 0),
                (int) ($lowMetrics['attendance_days'] ?? 0),
            ),
        ];

        if ((int) $top['agent_id'] === (int) $lowest['agent_id']) {
            return sprintf(
                '%s is currently the only ranked agent with activity in the last %d days.',
                $top['agent_name'],
                $days,
            );
        }

        return implode(' ', $parts);
    }
}
