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
}
