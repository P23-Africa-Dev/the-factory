<?php

declare(strict_types=1);

namespace App\Services\AI\Agent\Tools;

/**
 * Result of running a tool.
 *
 * `untrusted` marks results that carry user-generated text (lead notes, email
 * bodies, file contents). The agent wraps those as data and promotes any later
 * write in the same turn to Confirm, so injected instructions cannot act.
 */
final class ToolResult
{
    /**
     * @param  array<string, mixed>|array<int, mixed>  $payload
     * @param  array<int, string>  $sources
     * @param  array{tool: string, args: array<string, mixed>, label?: string}|null  $undo  the tool call that reverses this one
     */
    public function __construct(
        public readonly string $summary,
        public readonly array $payload = [],
        public readonly array $sources = [],
        public readonly bool $untrusted = false,
        public readonly ?string $link = null,
        public readonly ?array $undo = null,
    ) {}

    /**
     * @param  array<string, mixed>  $args
     */
    public function withUndo(string $tool, array $args, ?string $label = null): self
    {
        return new self($this->summary, $this->payload, $this->sources, $this->untrusted, $this->link, array_filter([
            'tool' => $tool,
            'args' => $args,
            'label' => $label,
        ], static fn ($v): bool => $v !== null));
    }

    public function withLink(string $link): self
    {
        return new self($this->summary, $this->payload, $this->sources, $this->untrusted, $link, $this->undo);
    }

    /**
     * @param  array<string, mixed>  $legacy  {summary, payload, sources}
     */
    public static function fromLegacy(array $legacy, bool $untrusted = false): self
    {
        $payload = $legacy['payload'] ?? [];

        return new self(
            summary: (string) ($legacy['summary'] ?? ''),
            payload: is_array($payload) ? $payload : ['value' => $payload],
            sources: array_values(array_map('strval', (array) ($legacy['sources'] ?? []))),
            untrusted: $untrusted,
        );
    }
}
