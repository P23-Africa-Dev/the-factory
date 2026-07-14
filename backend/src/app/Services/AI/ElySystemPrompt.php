<?php

declare(strict_types=1);

namespace App\Services\AI;

final class ElySystemPrompt
{
    public static function core(): string
    {
        return trim((string) config('ely.system_prompt')) . "\n\n" . trim((string) config('ely.runtime_constraints'));
    }

    public static function meetingTranscriptSummary(): string
    {
        return trim((string) config('ely.meeting_transcript_summary_prompt'));
    }

    public static function intro(): string
    {
        return (string) config('ely.intro', "I'm ELY, your AI Assistant.");
    }

    public static function name(): string
    {
        return (string) config('ely.name', 'ELY');
    }

    public static function readToolSynthesis(): string
    {
        return trim((string) config('ely.read_tool_synthesis_prompt'));
    }

    public static function fewShotExamples(): string
    {
        return trim((string) config('ely.few_shot_examples'));
    }

    public static function productKnowledge(): string
    {
        return trim((string) config('ely.product_knowledge'));
    }

    public static function productOverview(): string
    {
        return trim((string) config('ely.product_overview'));
    }
}
