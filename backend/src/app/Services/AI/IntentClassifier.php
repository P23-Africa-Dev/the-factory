<?php

declare(strict_types=1);

namespace App\Services\AI;

class IntentClassifier
{
    public function classify(string $message): array
    {
        $normalized = strtolower(trim($message));

        $actionPatterns = [
            'tasks.create' => [
                'create task',
                'new task',
                'add task',
            ],
            'tasks.reassign' => [
                'reassign task',
                'transfer task',
                'change task owner',
                'change assignee',
            ],
            'meetings.schedule' => [
                'schedule meeting',
                'book meeting',
                'create meeting',
            ],
            'notifications.send' => [
                'send notification',
                'notify team',
                'broadcast notification',
            ],
            'projects.create' => [
                'create project',
                'new project',
                'start project',
            ],
        ];

        foreach ($actionPatterns as $tool => $patterns) {
            foreach ($patterns as $pattern) {
                if (str_contains($normalized, $pattern)) {
                    return [
                        'type' => 'action',
                        'tool' => $tool,
                        'confidence' => 0.95,
                    ];
                }
            }
        }

        $toolPatterns = [
            'crm.top_leads' => [
                'top lead',
                'hottest lead',
                'hot leads',
                'lead',
                'crm',
                'pipeline',
            ],
            'tasks.overdue' => [
                'overdue task',
                'overdue',
                'due today',
                'late task',
                'task behind',
            ],
            'projects.at_risk_summary' => [
                'project at risk',
                'behind schedule',
                'project risk',
                'delayed project',
            ],
            'attendance.today_summary' => [
                'attendance',
                'absent',
                'clock in',
                'clock out',
                'late today',
            ],
            'meetings.today' => [
                'meeting',
                'calendar',
                'scheduled today',
                'upcoming meeting',
            ],
            'tracking.active_agents' => [
                'active agent',
                'currently online',
                'currently moving',
                'where is',
                'closest agent',
            ],
            'dashboard.overview' => [
                'dashboard',
                'overview',
                'kpi',
                'summary',
                'performance snapshot',
            ],
        ];

        foreach ($toolPatterns as $tool => $patterns) {
            foreach ($patterns as $pattern) {
                if (str_contains($normalized, $pattern)) {
                    return [
                        'type' => 'tool',
                        'tool' => $tool,
                        'confidence' => 0.9,
                    ];
                }
            }
        }

        return [
            'type' => 'general',
            'tool' => null,
            'confidence' => 0.4,
        ];
    }
}
