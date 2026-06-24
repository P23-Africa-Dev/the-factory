<?php

declare(strict_types=1);

namespace App\Services\AI\Support;

final class AiPlainTextFormatter
{
    public static function normalize(string $content): string
    {
        if (trim($content) === '') {
            return '';
        }

        $text = $content;

        $text = preg_replace('/\*\*([^*]+)\*\*/', '$1', $text) ?? $text;
        $text = preg_replace('/\*([^*\n]+)\*/', '$1', $text) ?? $text;
        $text = preg_replace('/__([^_]+)__/', '$1', $text) ?? $text;
        $text = preg_replace('/_([^_\n]+)_/', '$1', $text) ?? $text;
        $text = preg_replace('/^#{1,6}\s+/m', '', $text) ?? $text;
        $text = preg_replace('/^-{3,}\s*$/m', '', $text) ?? $text;
        $text = preg_replace('/^\s*[-*]\s+/m', '• ', $text) ?? $text;
        $text = preg_replace('/\n{3,}/', "\n\n", $text) ?? $text;

        return trim($text);
    }
}
