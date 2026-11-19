<?php

declare(strict_types=1);

namespace App\Services\AI\Agent\Chat;

/**
 * A tool as offered to the model: canonical name, description and JSON Schema.
 */
final class ToolSpec
{
    /**
     * @param  array<string, mixed>  $parameters  JSON Schema (type: object)
     */
    public function __construct(
        public readonly string $name,
        public readonly string $description,
        public readonly array $parameters,
    ) {}
}
