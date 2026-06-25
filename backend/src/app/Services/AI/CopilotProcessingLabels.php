<?php

declare(strict_types=1);

namespace App\Services\AI;

final class CopilotProcessingLabels
{
    /**
     * @return array<int, string>
     */
    public static function forMessage(string $message, ?array $intent = null): array
    {
        $tool = is_string($intent['tool'] ?? null) ? (string) $intent['tool'] : null;
        $type = (string) ($intent['type'] ?? 'general');

        if ($tool !== null) {
            return match ($tool) {
                'kpi.team_performance' => ['Thinking...', 'Analyzing team KPIs...', 'Ranking performers...'],
                'planning.daily' => ['Thinking...', 'Reviewing your schedule...', 'Prioritizing actions...'],
                'crm.create_lead' => ['Thinking...', 'Parsing lead details...', 'Preparing CRM record...'],
                'kpis.create' => ['Thinking...', 'Parsing KPI details...', 'Preparing KPI record...'],
                'crm.follow_up_summary', 'crm.stale_leads', 'crm.top_leads' => ['Thinking...', 'Scanning CRM records...', 'Sorting leads...'],
                'org.users' => ['Thinking...', 'Loading organization users...', 'Applying role scope...'],
                'crm.visit_extract' => ['Thinking...', 'Reading visit notes...', 'Extracting insights...'],
                'tasks.overdue' => ['Thinking...', 'Checking task deadlines...'],
                'dashboard.overview' => ['Thinking...', 'Loading dashboard metrics...'],
                'attendance.today_summary' => ['Thinking...', 'Pulling attendance data...'],
                'meetings.today' => ['Thinking...', 'Checking today\'s calendar...'],
                'tracking.active_agents' => ['Thinking...', 'Locating active agents...'],
                'projects.at_risk_summary' => ['Thinking...', 'Assessing project health...'],
                default => self::defaultLabels(),
            };
        }

        if ($type === 'action') {
            return ['Thinking...', 'Preparing action...', 'Validating details...'];
        }

        $normalized = strtolower($message);
        if (preg_match('/\b(perform|performance|kpi|team|rank)\b/i', $normalized) === 1) {
            return ['Thinking...', 'Analyzing performance data...', 'Sorting results...'];
        }

        return self::defaultLabels();
    }

    /**
     * @return array<int, string>
     */
    private static function defaultLabels(): array
    {
        return ['Thinking...', 'Analyzing...', 'Preparing response...'];
    }
}
