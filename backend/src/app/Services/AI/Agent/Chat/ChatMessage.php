<?php

declare(strict_types=1);

namespace App\Services\AI\Agent\Chat;

/**
 * Provider-neutral conversation message.
 *
 * role: "user" | "assistant" | "tool". The system prompt is not a message; it
 * lives on ChatRequest so adapters can place (and cache) it correctly.
 */
final class ChatMessage
{
    /**
     * @param  array<int, ToolCall>  $toolCalls  assistant messages only
     */
    public function __construct(
        public readonly string $role,
        public readonly string $content = '',
        public readonly array $toolCalls = [],
        public readonly ?string $toolCallId = null,
        public readonly ?string $toolName = null,
        public readonly bool $isError = false,
    ) {}

    public static function user(string $content): self
    {
        return new self('user', $content);
    }

    /**
     * @param  array<int, ToolCall>  $toolCalls
     */
    public static function assistant(string $content, array $toolCalls = []): self
    {
        return new self('assistant', $content, $toolCalls);
    }

    public static function toolResult(string $toolCallId, string $toolName, string $content, bool $isError = false): self
    {
        return new self('tool', $content, [], $toolCallId, $toolName, $isError);
    }
}
