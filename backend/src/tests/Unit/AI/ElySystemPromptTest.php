<?php

declare(strict_types=1);

namespace Tests\Unit\AI;

use App\Services\AI\ElySystemPrompt;
use Tests\TestCase;

final class ElySystemPromptTest extends TestCase
{
    public function test_core_prompt_contains_ely_identity(): void
    {
        $prompt = ElySystemPrompt::core();

        $this->assertStringContainsString('You are ELY', $prompt);
        $this->assertStringContainsString('Factory23 Workforce Management Platform', $prompt);
        $this->assertStringContainsString('Never identify yourself as ChatGPT', $prompt);
        $this->assertStringContainsString('Always refer to the organization by the provided company name', $prompt);
    }

    public function test_intro_and_name_match_brand(): void
    {
        $this->assertSame('ELY', ElySystemPrompt::name());
        $this->assertSame("I'm ELY, your Factory23 AI Assistant.", ElySystemPrompt::intro());
    }
}
