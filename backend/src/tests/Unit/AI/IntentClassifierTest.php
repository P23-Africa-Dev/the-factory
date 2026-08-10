<?php

declare(strict_types=1);

namespace Tests\Unit\AI;

use App\Services\AI\IntentClassifier;
use Tests\TestCase;

final class IntentClassifierTest extends TestCase
{
    public function test_classifies_create_me_a_meeting_prompt(): void
    {
        $classifier = new IntentClassifier();

        $intent = $classifier->classify('Create me a meeting with Agent Elijah and Matter');

        $this->assertSame('action', $intent['type']);
        $this->assertSame('meetings.schedule', $intent['tool']);
    }

    public function test_classifies_setup_the_meeting_prompt(): void
    {
        $classifier = new IntentClassifier();

        $intent = $classifier->classify('Setup the meeting');

        $this->assertSame('action', $intent['type']);
        $this->assertSame('meetings.schedule', $intent['tool']);
    }

    public function test_classifies_meeting_details_follow_up_prompt(): void
    {
        $classifier = new IntentClassifier();

        $intent = $classifier->classify('Meeting is 12pm on the 20th of this month for 2hrs');

        $this->assertSame('action', $intent['type']);
        $this->assertSame('meetings.schedule', $intent['tool']);
    }

    public function test_classifies_plan_my_day_prompt(): void
    {
        $classifier = new IntentClassifier();

        $intent = $classifier->classify('Plan my day');

        $this->assertSame('tool', $intent['type']);
        $this->assertSame('planning.daily', $intent['tool']);
    }

    public function test_classifies_team_performance_prompt(): void
    {
        $classifier = new IntentClassifier();

        $intent = $classifier->classify('Who is performing the best in my team and who is performing the least?');

        $this->assertSame('tool', $intent['type']);
        $this->assertSame('kpi.team_performance', $intent['tool']);
    }

    public function test_classifies_crm_follow_up_summary_prompt(): void
    {
        $intent = (new IntentClassifier())->classify('Give me a CRM follow-up summary');

        $this->assertSame('tool', $intent['type']);
        $this->assertSame('crm.follow_up_summary', $intent['tool']);
    }

    public function test_classifies_stale_leads_prompt(): void
    {
        $intent = (new IntentClassifier())->classify('Show stale leads not visited recently');

        $this->assertSame('tool', $intent['type']);
        $this->assertSame('crm.stale_leads', $intent['tool']);
    }

    public function test_classifies_visit_notes_extraction_prompt(): void
    {
        $intent = (new IntentClassifier())->classify('Extract visit notes from my field report');

        $this->assertSame('tool', $intent['type']);
        $this->assertSame('crm.visit_extract', $intent['tool']);
    }

    public function test_classifies_create_lead_prompt(): void
    {
        $intent = (new IntentClassifier())->classify('I want to add new lead to my CRM');

        $this->assertSame('action', $intent['type']);
        $this->assertSame('crm.create_lead', $intent['tool']);
    }

    public function test_classifies_set_task_for_assignee_prompt(): void
    {
        $classifier = new IntentClassifier();

        foreach ([
            'set task for kelvin',
            'set a task for kelvin to visit shoprite',
            'assign task to Elijah Stone',
        ] as $message) {
            $intent = $classifier->classify($message);

            $this->assertSame('action', $intent['type'], "Failed for message: {$message}");
            $this->assertSame('tasks.create', $intent['tool'], "Failed for message: {$message}");
        }
    }

    public function test_classifies_create_kpi_prompt(): void
    {
        $classifier = new IntentClassifier();

        foreach ([
            'Create a KPI for John Wick to achieve 50 retailer visits this month',
            'Set a new KPI for sales performance',
            'KPI name: Retail Visits',
        ] as $message) {
            $intent = $classifier->classify($message);

            $this->assertSame('action', $intent['type'], "Failed for message: {$message}");
            $this->assertSame('kpis.create', $intent['tool'], "Failed for message: {$message}");
        }
    }

    public function test_classifies_create_org_user_prompt(): void
    {
        $intent = (new IntentClassifier())->classify('Create me a new agent with name Ella Star');

        $this->assertSame('action', $intent['type']);
        $this->assertSame('org.users.create', $intent['tool']);
    }

    public function test_classifies_crm_leads_list_phrases(): void
    {
        $classifier = new IntentClassifier();

        foreach ([
            'Can you show me the leads on my CRM',
            'provide me the list of leads in my crm',
            'CRM leads',
            'How many leads are in my CRM?',
        ] as $message) {
            $intent = $classifier->classify($message);

            $this->assertSame('tool', $intent['type'], "Failed for message: {$message}");
            $this->assertSame('crm.top_leads', $intent['tool'], "Failed for message: {$message}");
        }
    }

    public function test_classifies_organization_users_list_phrases(): void
    {
        $classifier = new IntentClassifier();

        foreach ([
            'list users under this organisation',
            'Show organization users',
            'Who are the team members?',
        ] as $message) {
            $intent = $classifier->classify($message);

            $this->assertSame('tool', $intent['type'], "Failed for message: {$message}");
            $this->assertSame('org.users', $intent['tool'], "Failed for message: {$message}");
        }
    }

    public function test_classifies_task_list_queries_without_create_action(): void
    {
        $classifier = new IntentClassifier();

        $intent = $classifier->classify('Give me the list of tasks created by Agent John');

        $this->assertSame('tool', $intent['type']);
        $this->assertSame('tasks.list', $intent['tool']);
    }

    public function test_classifies_attendance_and_map_and_kpi_prompts(): void
    {
        $classifier = new IntentClassifier();

        $cases = [
            ['so, how many of my agent was present yesterday?', 'attendance.today_summary'],
            ['did john wick clock in yesterday?', 'attendance.today_summary'],
            ['how many businesses were pinned on the map?', 'map.pinned_locations_count'],
            ['which agent added the most businesses?', 'map.pinned_locations_count'],
            ['How many leads were added today?', 'crm.leads_analytics'],
            ['What was the conversion rate today?', 'crm.leads_analytics'],
            ['Which agent logged the most calls?', 'crm.calls_count'],
            ['Show KPI assigned to John', 'kpi.list'],
            ['Update John\'s KPI to 50 calls', 'kpis.update'],
            ['Where did John go yesterday?', 'tracking.agent_history'],
            ['Which businesses did John visit yesterday?', 'field.agent_visits'],
            ["Show me today's tracking", 'field.daily_summary'],
            ['What about today\'s field activities?', 'field.daily_summary'],
            ['Tell me about the tracking system today', 'field.daily_summary'],
            ['Who is currently tracking?', 'tracking.active_agents'],
            ['Show me task tracking after clock in', 'field.daily_summary'],
            ['John\'s tracking today', 'field.daily_summary'],
            ['What\'s Taraji\'s tracking activities for today before clock out', 'field.daily_summary'],
            ['What\'s the Journey history for Taraji', 'field.journey_history'],
            ['Check for agent Taraji Henson', 'field.daily_summary'],
        ];

        foreach ($cases as [$message, $tool]) {
            $intent = $classifier->classify($message);
            $this->assertSame($tool, $intent['tool'], "Failed for: {$message}");
        }
    }
}
