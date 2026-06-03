<?php

declare(strict_types=1);

namespace App\Services\AI\Policy;

class ToolPolicyService
{
    private const READ_TOOLS_AGENT = [
        'crm.top_leads',
        'tasks.overdue',
        'projects.at_risk_summary',
        'attendance.today_summary',
        'meetings.today',
        'dashboard.overview',
    ];

    private const READ_TOOLS_MANAGEMENT = [
        'crm.top_leads',
        'tasks.overdue',
        'projects.at_risk_summary',
        'attendance.today_summary',
        'meetings.today',
        'tracking.active_agents',
        'dashboard.overview',
    ];

    private const ACTION_TOOLS_MANAGEMENT = [
        'tasks.create',
        'tasks.reassign',
        'meetings.schedule',
        'notifications.send',
        'projects.create',
    ];

    public function canUseTool(string $role, string $tool): bool
    {
        return in_array($tool, $this->allowedToolsForRole($role), true);
    }

    public function allowedToolsForRole(string $role): array
    {
        if ($role === 'agent') {
            return self::READ_TOOLS_AGENT;
        }

        if (in_array($role, ['owner', 'admin', 'supervisor'], true)) {
            return [...self::READ_TOOLS_MANAGEMENT, ...self::ACTION_TOOLS_MANAGEMENT];
        }

        return self::READ_TOOLS_AGENT;
    }
}
