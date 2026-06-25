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
}
