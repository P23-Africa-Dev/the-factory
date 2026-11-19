<?php

declare(strict_types=1);

namespace App\Services\AI\Agent\Chat;

/**
 * One tool call requested by the model. `name` is the canonical ELY tool name
 * (dotted, e.g. "crm.create_lead"), already mapped back from the wire name.
 */
final class ToolCall
{
    /**
     * @param  array<string, mixed>  $arguments
     */
    public function __construct(
        public readonly string $id,
        public readonly string $name,
        public readonly array $arguments,
        public readonly bool $argumentsValid = true,
    ) {}

    /**
     * Provider wire names cannot contain dots, so "crm.create_lead" travels as
     * "crm__create_lead".
     */
    public static function toWireName(string $name): string
    {
        return str_replace('.', '__', $name);
    }

    public static function fromWireName(string $wireName): string
    {
        return str_replace('__', '.', $wireName);
    }

    /**
     * @return array{0: array<string, mixed>, 1: bool}
     */
    public static function decodeArguments(mixed $raw): array
    {
        if (is_array($raw)) {
            return [$raw, true];
        }

        if (! is_string($raw) || trim($raw) === '') {
            return [[], true];
        }

        $decoded = json_decode($raw, true);

        return is_array($decoded) ? [$decoded, true] : [[], false];
    }
}
