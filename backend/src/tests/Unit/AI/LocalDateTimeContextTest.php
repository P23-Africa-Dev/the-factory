<?php

declare(strict_types=1);

namespace Tests\Unit\AI;

use App\Services\AI\Support\LocalDateTimeContext;
use App\Services\Calendar\UserTimezoneResolver;
use Illuminate\Support\Carbon;
use Tests\TestCase;

final class LocalDateTimeContextTest extends TestCase
{
    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_detects_common_date_and_time_questions(): void
    {
        $context = new LocalDateTimeContext(new UserTimezoneResolver());

        $this->assertTrue($context->looksLikeDateTimeQuestion('What day is it today?'));
        $this->assertTrue($context->looksLikeDateTimeQuestion('what time is it'));
        $this->assertTrue($context->looksLikeDateTimeQuestion('What is today\'s date?'));
        $this->assertFalse($context->looksLikeDateTimeQuestion('Show overdue tasks'));
    }

    public function test_answers_using_client_timezone(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-10 11:08:00', 'UTC'));

        $context = new LocalDateTimeContext(new UserTimezoneResolver());
        $answer = $context->answer('Africa/Lagos', 'Shelby Global Ent.');

        $this->assertStringContainsString('Today is Friday, July 10, 2026.', $answer);
        $this->assertStringContainsString('The current local time is 12:08 PM (Africa/Lagos).', $answer);
        $this->assertStringContainsString('Shelby Global Ent.', $answer);
    }

    public function test_prompt_line_uses_resolved_timezone(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-10 08:30:00', 'America/New_York'));

        $context = new LocalDateTimeContext(new UserTimezoneResolver());
        $promptLine = $context->promptLine('America/New_York');

        $this->assertStringContainsString('Current local date and time for this user:', $promptLine);
        $this->assertStringContainsString('Friday, July 10, 2026 8:30 AM', $promptLine);
        $this->assertStringContainsString('America/New_York', $promptLine);
    }
}
