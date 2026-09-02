<?php

declare(strict_types=1);

namespace App\Services\AI;

final class CopilotProcessingLabels
{
    /**
     * Late-stage engagement fillers shared across intents so long waits stay lively.
     *
     * @return array<int, string>
     */
    public static function lateFillers(): array
    {
        return [
            'Retrieving data...',
            'Sorting results...',
            'Almost there...',
            'Just a little more...',
            'Preparing response...',
        ];
    }

    /**
     * @return array<int, string>
     */
    public static function forMessage(string $message, ?array $intent = null): array
    {
        $tool = is_string($intent['tool'] ?? null) ? (string) $intent['tool'] : null;
        $type = (string) ($intent['type'] ?? 'general');

        if ($tool !== null) {
            return match ($tool) {
                'kpi.team_performance' => self::withFillers(['Thinking...', 'Analyzing team KPIs...', 'Ranking performers...']),
                'planning.daily' => self::withFillers(['Thinking...', 'Reviewing your schedule...', 'Prioritizing actions...']),
                'crm.create_lead' => self::withFillers(['Thinking...', 'Parsing lead details...', 'Preparing CRM record...']),
                'crm.send_email' => self::withFillers(['Thinking...', 'Drafting email...', 'Preparing send confirmation...']),
                'kpis.create' => self::withFillers(['Thinking...', 'Parsing KPI details...', 'Preparing KPI record...']),
                'org.users.create' => self::withFillers(['Thinking...', 'Parsing user details...', 'Preparing invitation...']),
                'crm.follow_up_summary', 'crm.stale_leads', 'crm.top_leads', 'crm.leads' => self::withFillers(['Thinking...', 'Scanning CRM records...', 'Sorting leads...']),
                'org.users' => self::withFillers(['Thinking...', 'Loading organization users...', 'Applying role scope...']),
                'crm.visit_extract' => self::withFillers(['Thinking...', 'Reading visit notes...', 'Extracting insights...']),
                'tasks.overdue' => self::withFillers(['Thinking...', 'Checking task deadlines...']),
                'tasks.list' => self::withFillers(['Thinking...', 'Looking up tasks...', 'Filtering results...']),
                'tasks.create' => self::withFillers(['Thinking...', 'Preparing task...', 'Validating details...']),
                'tasks.reassign' => self::withFillers(['Thinking...', 'Updating task assignee...', 'Validating details...']),
                'meetings.schedule' => self::withFillers(['Thinking...', 'Checking availability...', 'Preparing meeting details...']),
                'meetings.today' => self::withFillers(['Thinking...', 'Checking today\'s calendar...']),
                'notifications.send' => self::withFillers(['Thinking...', 'Preparing notification...', 'Validating recipients...']),
                'dashboard.overview' => self::withFillers(['Thinking...', 'Loading dashboard metrics...']),
                'attendance.today_summary' => self::withFillers(['Thinking...', 'Pulling attendance data...']),
                'tracking.active_agents' => self::withFillers(['Thinking...', 'Locating active agents...']),
                'projects.at_risk_summary' => self::withFillers(['Thinking...', 'Assessing project health...']),
                'projects.create' => self::withFillers(['Thinking...', 'Preparing project...', 'Validating details...']),
                default => self::defaultLabels(),
            };
        }

        if ($type === 'action') {
            return self::withFillers(['Thinking...', 'Preparing action...', 'Validating details...']);
        }

        $normalized = strtolower($message);
        if (preg_match('/\b(perform|performance|kpi|team|rank)\b/i', $normalized) === 1) {
            return self::withFillers(['Thinking...', 'Analyzing performance data...', 'Sorting results...']);
        }

        if (preg_match('/\bplan\s+my\s+day\b/i', $normalized) === 1) {
            return self::withFillers(['Thinking...', 'Reviewing your schedule...', 'Prioritizing actions...']);
        }

        if (preg_match('/\b(crm|lead|follow[\s-]?up)\b/i', $normalized) === 1) {
            return self::withFillers(['Thinking...', 'Scanning CRM records...', 'Sorting leads...']);
        }

        if (preg_match('/\b(list|show|what|which|how many)\b/i', $normalized) === 1
            && preg_match('/\btasks?\b/i', $normalized) === 1) {
            return self::withFillers(['Thinking...', 'Looking up tasks...', 'Filtering results...']);
        }

        if (preg_match('/\b(create|add|set|assign)\b/i', $normalized) === 1
            && preg_match('/\btask\b/i', $normalized) === 1) {
            return self::withFillers(['Thinking...', 'Preparing task...', 'Validating details...']);
        }

        if (preg_match('/\bmeeting\b/i', $normalized) === 1) {
            return self::withFillers(['Thinking...', 'Checking availability...', 'Preparing meeting details...']);
        }

        return self::defaultLabels();
    }

    /**
     * @param  array<int, string>  $prefix
     * @return array<int, string>
     */
    private static function withFillers(array $prefix): array
    {
        $merged = [];
        $seen = [];

        foreach ([...$prefix, ...self::lateFillers()] as $label) {
            if (isset($seen[$label])) {
                continue;
            }
            $seen[$label] = true;
            $merged[] = $label;
        }

        return $merged;
    }

    /**
     * @return array<int, string>
     */
    private static function defaultLabels(): array
    {
        return self::withFillers(['Thinking...', 'Analyzing your request...']);
    }
}
