<?php

declare(strict_types=1);

namespace App\Services\AI\Policy;

class ToolPolicyService
{
    private const READ_TOOLS_AGENT = [
        'crm.top_leads',
        'crm.follow_up_summary',
        'crm.stale_leads',
        'crm.visit_extract',
        'crm.email_threads',
        'crm.unread_emails',
        'crm.draft_email',
        'crm.leads_analytics',
        'crm.calls_count',
        'tasks.overdue',
        'tasks.list',
        'projects.at_risk_summary',
        'attendance.today_summary',
        'attendance.duration_summary',
        'meetings.today',
        'dashboard.overview',
        'planning.daily',
        'kpi.list',
        'drive.files',
        'map.pinned_locations_count',
        'tracking.agent_history',
        'field.daily_summary',
        'field.agent_visits',
        'field.travel_vs_visit_time',
        'field.journey_history',
        'field.journey_detail',
    ];

    private const READ_TOOLS_MANAGEMENT = [
        'crm.top_leads',
        'crm.follow_up_summary',
        'crm.stale_leads',
        'crm.visit_extract',
        'crm.email_threads',
        'crm.unread_emails',
        'crm.draft_email',
        'crm.leads_analytics',
        'crm.calls_count',
        'tasks.overdue',
        'tasks.list',
        'projects.at_risk_summary',
        'attendance.today_summary',
        'attendance.duration_summary',
        'meetings.today',
        'tracking.active_agents',
        'tracking.agent_history',
        'dashboard.overview',
        'planning.daily',
        'kpi.team_performance',
        'kpi.list',
        'org.users',
        'drive.files',
        'map.pinned_locations_count',
        'field.daily_summary',
        'field.agent_visits',
        'field.unvisited_customers',
        'field.territory_coverage',
        'field.travel_vs_visit_time',
        'field.journey_history',
        'field.journey_detail',
    ];

    private const ACTION_TOOLS_MANAGEMENT = [
        'tasks.create',
        'tasks.reassign',
        'meetings.schedule',
        'notifications.send',
        'projects.create',
        'crm.log_visit',
        'crm.create_lead',
        'crm.send_email',
        'kpis.create',
        'kpis.update',
        'org.users.create',
    ];

    private const ACTION_TOOLS_AGENT = [
        'crm.log_visit',
        'crm.create_lead',
        'crm.send_email',
    ];

    public function canUseTool(string $role, string $tool): bool
    {
        return in_array($tool, $this->allowedToolsForRole($role), true);
    }

    public function isReadTool(string $tool): bool
    {
        return in_array($tool, $this->allReadTools(), true);
    }

    public function isActionTool(string $tool): bool
    {
        return in_array($tool, $this->allActionTools(), true);
    }

    /**
     * LLM routers sometimes label read tools (e.g. planning.daily) as "action"
     * because of verbs like "plan". Coerce type to match the tool catalog.
     */
    public function normalizeIntentType(string $type, ?string $tool): string
    {
        if (! is_string($tool) || $tool === '') {
            return $type === 'action' ? 'action' : ($type === 'tool' ? 'tool' : $type);
        }

        if ($this->isReadTool($tool)) {
            return 'tool';
        }

        if ($this->isActionTool($tool)) {
            return 'action';
        }

        return $type;
    }

    public function allowedToolsForRole(string $role): array
    {
        if ($role === 'agent') {
            return [...self::READ_TOOLS_AGENT, ...self::ACTION_TOOLS_AGENT];
        }

        if (in_array($role, ['owner', 'admin', 'supervisor'], true)) {
            return [...self::READ_TOOLS_MANAGEMENT, ...self::ACTION_TOOLS_MANAGEMENT];
        }

        return [...self::READ_TOOLS_AGENT, ...self::ACTION_TOOLS_AGENT];
    }

    /**
     * @return list<string>
     */
    private function allReadTools(): array
    {
        return array_values(array_unique([
            ...self::READ_TOOLS_AGENT,
            ...self::READ_TOOLS_MANAGEMENT,
        ]));
    }

    /**
     * @return list<string>
     */
    private function allActionTools(): array
    {
        return array_values(array_unique([
            ...self::ACTION_TOOLS_AGENT,
            ...self::ACTION_TOOLS_MANAGEMENT,
        ]));
    }
}
