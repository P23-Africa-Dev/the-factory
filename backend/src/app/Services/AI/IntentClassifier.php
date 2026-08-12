<?php

declare(strict_types=1);

namespace App\Services\AI;

class IntentClassifier
{
    public function classify(string $message): array
    {
        $normalized = strtolower(trim($message));

        if (
            preg_match('/\bproject\b/i', $normalized) === 1
            && preg_match('/\b(delete|remove|cancel|archive)\b/i', $normalized) === 1
        ) {
            return [
                'type' => 'general',
                'tool' => null,
                'confidence' => 0.4,
            ];
        }

        // Field GPS / task tracking must win over task-list and attendance "clock in" cues.
        $fieldTrackingTool = $this->resolveFieldTrackingTool($normalized);
        if ($fieldTrackingTool !== null) {
            return [
                'type' => 'tool',
                'tool' => $fieldTrackingTool,
                'confidence' => 0.93,
            ];
        }

        if ($this->matchesTaskListQuery($normalized)) {
            return [
                'type' => 'tool',
                'tool' => 'tasks.list',
                'confidence' => 0.92,
            ];
        }

        $actionPatterns = [
            'tasks.create' => [
                '/\b(create|add|open|new|set|assign|give)\s+(a\s+|an\s+)?task\b/i',
                '/\b(set|assign|give)\b.{0,40}\btask\b/i',
                '/\btask\b.{0,50}\bfor\b/i',
                '/\bcreate\s+task\b/i',
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
                '/\b(send|give)\b.{0,40}\b(reminder|reminders)\b/i',
                '/\b(remind|notify)\b.{0,40}\b(these\s+)?agents\b/i',
                '/\bsend\s+(them\s+)?a\s+reminder\b/i',
            ],
            'projects.create' => [
                '/\b(create|start|open|new)\s+(a\s+|an\s+)?project\b/i',
            ],
            'crm.log_visit' => [
                '/\blog\s+(this\s+)?visit\s+(to|for)\b/i',
                '/\brecord\s+(this\s+)?visit\b/i',
                '/\bupdate\s+crm\s+from\s+visit\b/i',
            ],
            'crm.create_lead' => [
                '/\b(add|create|register|save|new)\b.{0,60}\b(lead|crm\s+lead|crm\s+record)\b/i',
                '/\b(add|create|register)\b.{0,40}\b(business|company)\b.{0,40}\b(to\s+)?(crm|pipeline)\b/i',
                '/\bnew\s+lead\b/i',
            ],
            'crm.send_email' => [
                '/\b(send|email|write|draft)\b.{0,80}\b(email|mail|message)\b/i',
                '/\b(send|write|draft)\s+(?:a\s+)?follow[\s-]?up\b/i',
                '/\bfollow[\s-]?up\s+to\b/i',
                '/\bfollow[\s-]?up\b.{0,60}\b(email|mail|client|lead|customer)\b/i',
                '/\bemail\b.{0,40}\b(about|regarding|for)\b/i',
            ],
            'kpis.create' => [
                '/\b(create|add|set|define|new)\b.{0,60}\bkpi\b/i',
                '/\b(create|add|set|define)\b.{0,60}\b(key\s*performance\s*indicator|performance\s*target)\b/i',
                '/\bkpi\s+name\b/i',
                '/\bset\s+kpi\s+for\b/i',
                '/\bset\s+all\s+agents[\'\x27]?\s+kpi\b/i',
            ],
            'kpis.update' => [
                '/\b(update|edit|change|modify|raise|increase|decrease)\b.{0,40}\bkpi\b/i',
                '/\bupdate\s+\w.+?\s+kpi\s+to\b/i',
            ],
            'org.users.create' => [
                '/\b(create|add|invite|register|onboard)\b.{0,80}\b(agent|supervisor|admin|user|staff|team\s+member)\b/i',
                '/\bnew\s+(agent|supervisor|admin|user)\b/i',
                '/\badd\s+(an?\s+)?(agent|supervisor|admin)\b/i',
            ],
        ];

        foreach ($actionPatterns as $tool => $regexPatterns) {
            if ($tool === 'tasks.create' && $this->matchesTaskListQuery($normalized)) {
                continue;
            }

            if ($tool === 'kpis.create' && $this->matchesKpiListQuery($normalized)) {
                continue;
            }

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
            'crm.follow_up_summary' => [
                '/\bfollow[\s-]?up\s+(summary|recommend)/i',
                '/\blead\s+summar/i',
                '/\bcrm\s+follow[\s-]?ups?\b/i',
                '/\bwho\s+should\s+i\s+follow[\s-]?up\b/i',
                '/\bwho\s+needs\s+(a\s+)?follow[\s-]?up\b/i',
            ],
            'crm.stale_leads' => [
                '/\b(stale\s+leads?|not\s+visited\s+recently|businesses?\s+not\s+visited)\b/i',
                '/\bwho\s+hasn[\x27\x60]?t\s+been\s+contacted\b/i',
                '/\bnot\s+contacted\s+(lately|recently)\b/i',
            ],
            'crm.visit_extract' => [
                '/\b(process|structure|extract)\s+visit\s+notes?\b/i',
                '/\bvisit\s+notes?\b/i',
            ],
            'crm.email_threads' => [
                '/\b(summarize|summary|show)\b.{0,60}\b(email|conversation|thread)\b/i',
                '/\bconversation\b.{0,40}\b(with|for)\b/i',
            ],
            'crm.unread_emails' => [
                '/\bunread\b.{0,40}\b(email|mail|message)\b/i',
                '/\b(show|list)\b.{0,40}\bunread\b/i',
            ],
            'crm.draft_email' => [
                '/\bdraft\b.{0,60}\b(email|mail|message|reminder|follow[\s-]?up)\b/i',
                '/\bwrite\b.{0,40}\b(email|mail)\b/i',
            ],
            'crm.leads_analytics' => [
                '/\bhow\s+many\s+leads?\s+(were\s+)?added\b/i',
                '/\bleads?\s+added\s+(today|yesterday)\b/i',
                '/\bwho\s+added\s+(those\s+|the\s+)?leads?\b/i',
                '/\bconversion\s+rate\b/i',
                '/\bwhat\s+was\s+the\s+conversion\b/i',
            ],
            'crm.calls_count' => [
                '/\bhow\s+many\s+calls?\b/i',
                '/\bcalls?\s+(were\s+)?logged\b/i',
                '/\bwhich\s+agent\s+logged\s+the\s+most\s+calls?\b/i',
                '/\bmost\s+calls?\b/i',
            ],
            'crm.top_leads' => [
                '/\b(top|hot|hottest)\s+leads?\b/i',
                '/\bpipeline\b/i',
                '/\b(show|list)\s+(my\s+)?leads?\b/i',
                '/\bcrm\s+leads?\b/i',
                '/\bleads?\s+(in|on|from)\s+(my\s+)?crm\b/i',
                '/\bleads?\s+in\s+[a-z]/i',
                '/\bleads?\s+(located|based)\s+in\b/i',
                '/\b(my\s+)?crm\s+(leads?|records?|pipeline)\b/i',
                '/\bhow\s+many\s+leads?\b/i',
                '/\b(list|show|get|give|provide|pull|fetch|display|retrieve|view)\b.{0,60}\bleads?\b/i',
                '/\bleads?\s+(list|listing|overview|summary)\b/i',
                '/\bwhat\s+about\b.{0,80}\b(leads?|faith|university|bank|school|station)\b/i',
                '/\bdo\s+i\s+have\b.{0,40}\bleads?\s+in\b/i',
            ],
            'org.users' => [
                '/\b(list|show|get|display|view|who\s+are)\b.{0,60}\b(users?|members?|staff|workforce|team\s+members?)\b/i',
                '/\busers?\s+(in|under|of)\s+(this\s+)?(organi[sz]ation|company|team)\b/i',
                '/\bteam\s+(members?|roster|directory)\b/i',
                '/\b(organi[sz]ation|company)\s+users?\b/i',
                '/\blist\s+(all\s+)?(users?|members?|agents?)\b/i',
            ],
            'drive.files' => [
                '/\bcompany\s+drive\b/i',
                '/\b(company|organi[sz]ation|org|shared|our|team)\s+(files?|documents?|drive)\b/i',
                '/\b(files?|documents?)\s+(in|on|from|inside)\s+(the\s+)?(drive|company|folder)\b/i',
                '/\b(list|show|find|get|open|view|search|browse|display|pull|fetch)\b.{0,40}\b(files?|documents?|pdf|spreadsheet|folder)\b/i',
                '/\b(what|which)\s+(files?|documents?)\b/i',
                '/\bdo\s+(i|we)\s+have\b.{0,40}\b(files?|documents?|report|policy|manual)\b/i',
                '/\b(summar(?:y|ize|ise)|according\s+to|contents?|read|open)\b.{0,40}\b(file|document|report|pdf|sheet|spreadsheet|doc|policy|manual|memo|proposal|contract|invoice)\b/i',
                '/\bwhat\s+does\s+the\b.{0,40}\b(report|document|file|pdf|sheet|spreadsheet|policy|manual|memo|proposal|contract|invoice)\b/i',
                '/\b(in|from)\s+the\b.{0,30}\b(report|document|file|pdf|sheet|policy|manual|memo|proposal|contract)\b.{0,20}\b(say|says|state|mention|about|regarding)\b/i',
            ],
            'tasks.overdue' => [
                '/\boverdue\s+tasks?\b/i',
                '/\bdue\s+today\b/i',
                '/\blate\s+tasks?\b/i',
                '/\bwhat[\x27\x60]?s\s+overdue\b/i',
                '/\bwhat\s+is\s+overdue\b/i',
                '/\bshow\s+overdue\b/i',
            ],
            'tasks.list' => [
                '/\b(list|show|get|give|provide|pull|fetch|display|retrieve|view|what|which|how many)\b.{0,80}\btasks?\b/i',
                '/\btasks?\b.{0,80}\b(created|assigned|by|for)\b/i',
                '/\bwhat\s+tasks?\b/i',
                '/\bwhich\s+tasks?\b/i',
            ],
            'projects.at_risk_summary' => [
                '/\b(projects?\s+at\s+risk|project\s+risk|behind\s+schedule|delayed\s+projects?)\b/i',
            ],
            'attendance.today_summary' => [
                '/\battendance\b/i',
                '/\babsent\b/i',
                '/\bpresent\b/i',
                '/\bclock(?:ed)?\s+(in|out)\b/i',
                '/\bwho\s+(was|were)\s+(present|late|absent)\b/i',
                '/\bhow\s+many\b.{0,40}\b(agent|employee|staff).{0,20}\bpresent\b/i',
            ],
            'attendance.duration_summary' => [
                '/\bhow\s+long\b.{0,40}\b(field|clock|attendance|work)\b/i',
                '/\b(attendance\s+duration|clocked\s+in\s+duration|work\s+duration)\b/i',
            ],
            'map.pinned_locations_count' => [
                '/\b(pinned\s+locations|map\s+pins|locations?\s+pinned|pinned\s+on\s+the\s+map)\b/i',
                '/\blocation\s+is\s+pinned\b/i',
                '/\bpinned\s+by\b/i',
                '/\bhow\s+many\s+(locations?|businesses?|pins?)\s+(are\s+)?pinned\b/i',
                '/\bhow\s+many\s+(new\s+)?businesses?\s+(were\s+)?added\b/i',
                '/\bwhich\s+agent\s+added\s+the\s+most\s+business/i',
                '/\brecently\s+added\s+business/i',
                '/\bbusinesses?\s+pinned\b/i',
                '/\b(list|show|get|give)\b.{0,40}\b(pinned\s+locations?|locations?\s+on\s+the\s+map)\b/i',
            ],
            'kpi.list' => [
                '/\b(show|list|get|display|view)\b.{0,40}\bkpi\b/i',
                '/\bkpi\s+assigned\s+to\b/i',
                '/\bwhat\s+kpi\b/i',
            ],
            'tracking.agent_history' => [
                '/\bwhere\s+did\b.{0,40}\bgo\b/i',
                '/\blocation\s+history\b/i',
                '/\b(gps|location|movement)\s+(trail|path|history)\b/i',
            ],
            'meetings.today' => [
                '/\b(meetings?\s+today|upcoming\s+meetings?|calendar)\b/i',
            ],
            'tracking.active_agents' => [
                '/\b(active\s+agents?|currently\s+online|currently\s+moving|closest\s+agent)\b/i',
                '/\bwhere\s+is\b/i',
            ],
            'field.daily_summary' => [
                '/\bfield\s+(activity|activities|summary|day|tracking)\b/i',
                '/\bdaily\s+field\s+summary\b/i',
                '/\b(today|yesterday|this\s+week)[\x27\x60]?s?\s+(field\s+)?(tracking|activities)\b/i',
                '/\b(tracking\s+system|gps\s+tracking|task\s+tracking)\b/i',
            ],
            'field.agent_visits' => [
                '/\b(customer|lead|field)\s+visits?\b/i',
                '/\bwhich\s+businesses?\s+.+\s+visit/i',
                '/\bhow\s+many\s+visits?\b/i',
                '/\bvisits?\s+(yesterday|today|this\s+week)\b/i',
                '/\bwhich\s+agent\s+visited\s+the\s+most\b/i',
            ],
            'field.unvisited_customers' => [
                '/\b(haven.?t\s+been\s+visited|not\s+visited|unvisited)\b/i',
                '/\bcustomers?\s+not\s+visited\b/i',
            ],
            'field.territory_coverage' => [
                '/\bterritory\s+coverage\b/i',
                '/\bpoor\s+coverage\b/i',
                '/\bcoverage\s+heatmap\b/i',
            ],
            'field.travel_vs_visit_time' => [
                '/\b(travel|travelling|traveling)\s+time\b/i',
                '/\bproductive\s+vs\s+personal\b/i',
                '/\btime\s+spent\s+(travelling|traveling|with\s+customers)\b/i',
            ],
            'field.journey_history' => [
                '/\bjourney\s+history\b/i',
                '/\b(daily\s+)?journeys?\b/i',
                '/\bfield\s+activity\s+timeline\b/i',
            ],
            'field.journey_detail' => [
                '/\b(show|replay|open)\s+.+\s+journey\b/i',
                '/\bjourney\s+(yesterday|today|on\s+\w+)\b/i',
                '/\breplay\s+.+\s+(day|journey)\b/i',
            ],
            'dashboard.overview' => [
                '/\b(dashboard|overview|kpi\s+snapshot|performance\s+snapshot)\b/i',
            ],
            'kpi.team_performance' => [
                '/\bhow\s+is\s+the\s+team\s+perform/i',
                '/\b(who\s+is\s+perform|who\s+performs?\s+best|who\s+performs?\s+(the\s+)?least)\b/i',
                '/\bperforming\s+the\s+(best|least)\b/i',
                '/\b(best|top)\s+perform/i',
                '/\b(worst|lowest|least)\s+perform/i',
                '/\bteam\s+performance\b/i',
                '/\b(underperform|top\s+performer)/i',
            ],
            'planning.daily' => [
                '/\bplan\s+my\s+day\b/i',
                '/\bwhat\s+should\s+i\s+(visit|do)\s+next\b/i',
                '/\bwhat\s+should\s+i\s+do\s+today\b/i',
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

    /**
     * Natural-language field GPS / task-tracking reads (clock-in → tracking begins).
     */
    private function resolveFieldTrackingTool(string $normalized): ?string
    {
        $mentionsTracking = preg_match(
            '/\b(tracking|tracked|gps|geolocat(?:ion|e|ing)?|live\s+map|field\s+activit(?:y|ies)|field\s+day|field\s+tracking|(?:daily\s+)?journeys?|route\s+replay)\b/i',
            $normalized,
        ) === 1
            || preg_match('/\btask\s+tracking\b/i', $normalized) === 1
            || preg_match('/\bstart(?:ed|ing)?\s+(task\s+)?tracking\b/i', $normalized) === 1
            || preg_match('/\b(location|movement)\s+history\b/i', $normalized) === 1
            || preg_match('/\bcheck\b.{0,40}\b(agent|tracking|field)\b/i', $normalized) === 1;

        if (! $mentionsTracking && preg_match('/\b(in\s+the\s+field|field\s+agents?)\b/i', $normalized) !== 1) {
            return null;
        }

        if (
            preg_match('/\b(who\s+is|who\s+are|currently|right\s+now|live|online|actively)\b/i', $normalized) === 1
            && preg_match('/\b(track|tracking|moving|online|in\s+the\s+field|field)\b/i', $normalized) === 1
        ) {
            return 'tracking.active_agents';
        }

        if (
            preg_match('/\b(active\s+(?:field\s+)?(?:agents?|tracking)|currently\s+tracking|who\s+is\s+tracking)\b/i', $normalized) === 1
        ) {
            return 'tracking.active_agents';
        }

        if (
            preg_match('/\b(show|replay|open)\b.{0,40}\bjourney\b/i', $normalized) === 1
            || preg_match('/\breplay\b.{0,40}\b(day|route|journey)\b/i', $normalized) === 1
            || preg_match('/\bjourney\s+(yesterday|today|on\s+\w+)\b/i', $normalized) === 1
        ) {
            return 'field.journey_detail';
        }

        if (
            preg_match('/\bjourney\s+history\b/i', $normalized) === 1
            || preg_match('/\b(daily\s+)?journeys?\b/i', $normalized) === 1
            || preg_match('/\bfield\s+activity\s+timeline\b/i', $normalized) === 1
        ) {
            return 'field.journey_history';
        }

        if (
            preg_match('/\bwhere\s+did\b.{0,40}\bgo\b/i', $normalized) === 1
            || preg_match('/\b(location|gps|movement|track)\s+history\b/i', $normalized) === 1
            || preg_match('/\b(gps|location|movement)\s+(trail|path)\b/i', $normalized) === 1
        ) {
            return 'tracking.agent_history';
        }

        if (
            preg_match('/\b(customer|lead|field)\s+visits?\b/i', $normalized) === 1
            || preg_match('/\bwhich\s+businesses?\s+.+\s+visit/i', $normalized) === 1
            || preg_match('/\bhow\s+many\s+visits?\b/i', $normalized) === 1
            || preg_match('/\bvisits?\s+(yesterday|today|this\s+week)\b/i', $normalized) === 1
        ) {
            return 'field.agent_visits';
        }

        if (
            preg_match('/\b(travel|travelling|traveling)\s+time\b/i', $normalized) === 1
            || preg_match('/\bproductive\s+vs\s+personal\b/i', $normalized) === 1
        ) {
            return 'field.travel_vs_visit_time';
        }

        // Default: day/team field tracking after clock-in / start task tracking.
        // Also covers "tracking activities" and "check for agent X".
        return 'field.daily_summary';
    }

    private function matchesTaskListQuery(string $normalized): bool
    {
        if (preg_match('/\btasks?\b/i', $normalized) !== 1) {
            return false;
        }

        // "task tracking" is GPS field tracking, not the tasks list.
        if (preg_match('/\btask\s+tracking\b/i', $normalized) === 1) {
            return false;
        }

        if (preg_match('/\boverdue\b/i', $normalized) === 1) {
            return false;
        }

        if (preg_match('/\b(create|add|open|new|schedule)\s+(a\s+|an\s+)?task\b/i', $normalized) === 1) {
            return false;
        }

        $hasListCue = preg_match('/\b(list|show|what|which|how many)\b/i', $normalized) === 1;

        if (! $hasListCue && preg_match('/\b(set|assign|give)\b.{0,40}\btask\b/i', $normalized) === 1) {
            return false;
        }

        if (! $hasListCue && preg_match('/\btask\b.{0,50}\bfor\b/i', $normalized) === 1) {
            return false;
        }

        return preg_match('/\b(list|show|get|give|provide|pull|fetch|display|retrieve|view|what|which|how many)\b/i', $normalized) === 1
            || preg_match('/\b(created|assigned)\s+(by|to)\b/i', $normalized) === 1
            || preg_match('/\btasks?\s+(created|assigned)\s+(by|to)\b/i', $normalized) === 1;
    }

    private function matchesKpiListQuery(string $normalized): bool
    {
        if (preg_match('/\bkpi\b/i', $normalized) !== 1) {
            return false;
        }

        return preg_match('/\b(show|list|get|display|view|assigned\s+to|what)\b/i', $normalized) === 1
            && preg_match('/\b(create|add|set|define|new|update|edit|change)\b/i', $normalized) !== 1;
    }
}
