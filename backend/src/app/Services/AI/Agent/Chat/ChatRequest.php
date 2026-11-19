<?php

declare(strict_types=1);

namespace App\Services\AI\Agent\Chat;

final class ChatRequest
{
    /**
     * @param  array<int, ChatMessage>  $messages
     * @param  array<int, ToolSpec>  $tools
     * @param  array<string, mixed>  $options  e.g. model, timeout_ms
     */
    public function __construct(
        public readonly string $systemPrompt,
        public readonly array $messages,
        public readonly array $tools = [],
        public readonly int $maxTokens = 2000,
        public readonly string $purpose = 'agent',
        public readonly array $options = [],
    ) {}
}
