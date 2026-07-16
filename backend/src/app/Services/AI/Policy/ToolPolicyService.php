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
        'tasks.overdue',
        'projects.at_risk_summary',
        'attendance.today_summary',
        'meetings.today',
        'dashboard.overview',
        'planning.daily',
        'drive.files',
    ];

    private const READ_TOOLS_MANAGEMENT = [
        'crm.top_leads',
        'crm.follow_up_summary',
        'crm.stale_leads',
        'crm.visit_extract',
        'crm.email_threads',
        'crm.unread_emails',
        'crm.draft_email',
        'tasks.overdue',
        'projects.at_risk_summary',
        'attendance.today_summary',
        'meetings.today',
        'tracking.active_agents',
        'dashboard.overview',
        'planning.daily',
        'kpi.team_performance',
        'org.users',
        'drive.files',
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
}
