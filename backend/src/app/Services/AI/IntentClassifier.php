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
                '/\b(create|add|open|new)\s+(a\s+|an\s+)?task\b/i',
            ],
            'tasks.reassign' => [
                '/\b(reassign|transfer|move|change)\s+(the\s+)?task\b/i',
                '/\b(change|update)\s+(task\s+)?assignee\b/i',
            ],
            'meetings.schedule' => [
                '/\b(schedule|book|create|set\s*up|setup|arrange|plan|organize)\b.{0,80}\bmeeting\b/i',
                '/\b(create|schedule|set\s*up|setup)\s+me\s+(a\s+)?meeting\b/i',
                '/\bmeeting\b.{0,60}\b(with|for|between)\b/i',
                '/^\s*meeting\s+(is\s+)?(at|on|for)\b/i',
                '/\b(setup|set\s*up|schedule)\s+(the\s+)?meeting\b/i',
            ],
            'notifications.send' => [
                '/\b(send|broadcast|push)\s+(a\s+|an\s+)?notification\b/i',
                '/\bnotify\s+(team|everyone|all|agents|supervisors|admins)\b/i',
            ],
            'projects.create' => [
                '/\b(create|start|open|new)\s+(a\s+|an\s+)?project\b/i',
            ],
            'crm.log_visit' => [
                '/\blog\s+(this\s+)?visit\s+(to|for)\b/i',
                '/\brecord\s+(this\s+)?visit\b/i',
                '/\bupdate\s+crm\s+from\s+visit\b/i',
            ],
        ];

        foreach ($actionPatterns as $tool => $regexPatterns) {
            foreach ($regexPatterns as $regex) {
                if (preg_match($regex, $normalized) === 1) {
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
                '/\b(top|hot|hottest)\s+leads?\b/i',
                '/\bcrm\b/i',
                '/\bpipeline\b/i',
            ],
            'crm.follow_up_summary' => [
                '/\bfollow[\s-]?up\s+(summary|recommend)/i',
                '/\blead\s+summar/i',
                '/\bcrm\s+follow[\s-]?ups?\b/i',
            ],
            'crm.stale_leads' => [
                '/\b(stale\s+leads?|not\s+visited\s+recently|businesses?\s+not\s+visited)\b/i',
            ],
            'crm.visit_extract' => [
                '/\b(process|structure|extract)\s+visit\s+notes?\b/i',
                '/\bvisit\s+notes?\b/i',
            ],
            'tasks.overdue' => [
                '/\boverdue\s+tasks?\b/i',
                '/\bdue\s+today\b/i',
                '/\blate\s+tasks?\b/i',
            ],
            'projects.at_risk_summary' => [
                '/\b(projects?\s+at\s+risk|project\s+risk|behind\s+schedule|delayed\s+projects?)\b/i',
            ],
            'attendance.today_summary' => [
                '/\battendance\b/i',
                '/\babsent\b/i',
                '/\bclock\s+(in|out)\b/i',
            ],
            'meetings.today' => [
                '/\b(meetings?\s+today|upcoming\s+meetings?|calendar)\b/i',
            ],
            'tracking.active_agents' => [
                '/\b(active\s+agents?|currently\s+online|currently\s+moving|closest\s+agent)\b/i',
                '/\bwhere\s+is\b/i',
            ],
            'dashboard.overview' => [
                '/\b(dashboard|overview|kpi|performance\s+snapshot)\b/i',
            ],
            'planning.daily' => [
                '/\bplan\s+my\s+day\b/i',
                '/\bwhat\s+should\s+i\s+(visit|do)\s+next\b/i',
                '/\bfollow[\s-]?ups?\s+due\b/i',
                '/\bnearby\s+opportunit/i',
                '/\bhelp\s+me\s+achieve\s+my\s+kpi\b/i',
                '/\bprioriti[sz]e\s+my\s+(day|visits?|tasks?)\b/i',
                '/\bwhat\s+needs\s+(my\s+)?attention\b/i',
                '/\bwhat\s+should\s+i\s+focus\s+on\b/i',
            ],
        ];

        foreach ($toolPatterns as $tool => $regexPatterns) {
            foreach ($regexPatterns as $regex) {
                if (preg_match($regex, $normalized) === 1) {
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
