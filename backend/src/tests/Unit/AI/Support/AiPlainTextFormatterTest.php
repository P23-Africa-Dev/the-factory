<?php

declare(strict_types=1);

namespace Tests\Unit\AI\Support;

use App\Services\AI\Support\AiPlainTextFormatter;
use PHPUnit\Framework\TestCase;

final class AiPlainTextFormatterTest extends TestCase
{
    public function test_normalizes_markdown_symbols_to_plain_text(): void
    {
        $input = "**SUMMARY**\n\n---\n\n- **Item one**\n- Item two\n\n1. **First step**";

        $output = AiPlainTextFormatter::normalize($input);

        $this->assertStringNotContainsString('**', $output);
        $this->assertStringNotContainsString('---', $output);
        $this->assertStringContainsString('SUMMARY', $output);
        $this->assertStringContainsString('• Item one', $output);
        $this->assertStringContainsString('1. First step', $output);
    }
}
